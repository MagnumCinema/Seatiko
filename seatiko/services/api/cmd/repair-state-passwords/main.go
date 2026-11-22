package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

func hash(password string) string {
	value, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		panic(err)
	}
	return string(value)
}

func main() {
	statePath := os.Getenv("STATE_FILE")
	if statePath == "" {
		fmt.Fprintln(os.Stderr, "STATE_FILE is required")
		os.Exit(2)
	}
	fmt.Fprint(os.Stderr, "Current restaurant owner password: ")
	pilotPassword, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil {
		panic(err)
	}
	pilotPassword = strings.TrimSpace(pilotPassword)

	payload, err := os.ReadFile(statePath)
	if err != nil {
		panic(err)
	}
	var state map[string]any
	if err := json.Unmarshal(payload, &state); err != nil {
		panic(err)
	}
	users, ok := state["users"].(map[string]any)
	if !ok {
		panic("state has no users map")
	}
	passwords := map[string]string{
		"admin@seatiko.local":    "admin123",
		"owner@seatiko.local":    "owner123",
		"guest@seatiko.local":    "guest123",
		"qa-owner@seatiko.local": "secret123",
		"qa-guest@seatiko.local": "secret123",
		"yuliitezary@gmail.com":        pilotPassword,
	}
	repaired := 0
	for _, raw := range users {
		user, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		email, _ := user["email"].(string)
		password, exists := passwords[strings.ToLower(email)]
		if !exists {
			continue
		}
		user["password_hash"] = hash(password)
		repaired++
	}
	if repaired != len(passwords) {
		panic(fmt.Sprintf("repaired %d password hashes, expected %d", repaired, len(passwords)))
	}
	encoded, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		panic(err)
	}
	temporary, err := os.CreateTemp(filepath.Dir(statePath), "repaired-state-*.json")
	if err != nil {
		panic(err)
	}
	temporaryPath := temporary.Name()
	if err := temporary.Chmod(0o600); err != nil {
		panic(err)
	}
	if _, err := temporary.Write(encoded); err != nil {
		panic(err)
	}
	if err := temporary.Close(); err != nil {
		panic(err)
	}
	if err := os.Rename(temporaryPath, statePath); err != nil {
		panic(err)
	}
	fmt.Fprintf(os.Stderr, "Repaired %d password hashes\n", repaired)
}
