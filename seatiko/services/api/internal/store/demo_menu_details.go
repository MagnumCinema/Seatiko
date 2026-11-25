package store

import (
	"strings"

	"github.com/seatiko/api/internal/models"
)

// Allergen codes stored on MenuItem.Allergens and localised in the web UI.
const (
	allergenGluten      = "gluten"
	allergenMilk        = "milk"
	allergenEggs        = "eggs"
	allergenFish        = "fish"
	allergenCrustaceans = "crustaceans"
	allergenSoy         = "soy"
	allergenNuts        = "nuts"
	allergenPeanuts     = "peanuts"
	allergenCelery      = "celery"
	allergenMustard     = "mustard"
	allergenSesame      = "sesame"
	allergenSulphites   = "sulphites"
	allergenMolluscs    = "molluscs"
)

// containsWord matches whole tokens so short codes like "ipa" do not hit "Antipasti".
func containsWord(haystack, word string) bool {
	for _, part := range strings.FieldsFunc(haystack, func(r rune) bool {
		return r == ' ' || r == ',' || r == '/' || r == '-' || r == '·' || r == '(' || r == ')'
	}) {
		if part == word {
			return true
		}
	}
	return false
}

func uniqStrings(in []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}

func containsAllergen(list []string, code string) bool {
	for _, a := range list {
		if a == code {
			return true
		}
	}
	return false
}

// demoDishDetails returns a full ingredients paragraph and allergen codes for a seeded dish.
func demoDishDetails(d demoDish) (models.LocalizedString, []string) {
	name := strings.ToLower(d.name.EN + " " + d.category.EN)
	var ingredients models.LocalizedString
	var allergens []string

	switch {
	case strings.Contains(name, "plăcint") || strings.Contains(name, "placint"):
		ingredients = ls(
			"Тянутое тесто из пшеничной муки, начинка по рецепту, растительное масло, соль.",
			"Stretched wheat-flour dough, filling as listed, vegetable oil, salt.",
			"Aluat întins din făină de grâu, umplutură după rețetă, ulei vegetal, sare.",
		)
		allergens = []string{allergenGluten}
		if strings.Contains(name, "cheese") || strings.Contains(name, "brânză") || strings.Contains(name, "brinza") {
			ingredients = ls(
				"Тянутое тесто, овечья брынза, яйцо, зелень, растительное масло.",
				"Stretched dough, sheep cheese, egg, herbs, vegetable oil.",
				"Aluat întins, brânză de oi, ou, verdeață, ulei vegetal.",
			)
			allergens = []string{allergenGluten, allergenMilk, allergenEggs}
		}
	case strings.Contains(name, "soup") || strings.Contains(name, "borscht") || strings.Contains(name, "zeam") || strings.Contains(name, "ciorb"):
		ingredients = ls(
			"Бульон, овощи, зелень, специи; подаётся со сметаной по желанию.",
			"Broth, vegetables, herbs, spices; sour cream on the side if desired.",
			"Supă, legume, verdeață, condimente; smântână la cerere.",
		)
		allergens = []string{allergenCelery, allergenMilk, allergenEggs}
		if strings.Contains(name, "pumpkin") {
			ingredients = ls(
				"Тыква, лук, морковь, картофель, чеснок, сливки, имбирь, тыквенные семечки, оливковое масло, специи.",
				"Pumpkin, onion, carrot, potato, garlic, cream, ginger, pumpkin seeds, olive oil, spices.",
				"Dovleac, ceapă, morcov, cartofi, usturoi, smântână, ghimbir, semințe de dovleac, ulei de măsline, condimente.",
			)
			allergens = []string{allergenMilk}
		}
	case strings.Contains(name, "salad") || strings.Contains(name, "caprese") || strings.Contains(name, "burrata") || strings.Contains(name, "caesar"):
		ingredients = ls(
			"Свежие овощи и зелень, заправка домашнего приготовления, специи.",
			"Fresh vegetables and greens, house dressing, spices.",
			"Legume și verdeață proaspete, dressing de casă, condimente.",
		)
		if strings.Contains(name, "caesar") || strings.Contains(name, "cheese") || strings.Contains(name, "feta") || strings.Contains(name, "caprese") || strings.Contains(name, "burrata") || strings.Contains(name, "brinza") || strings.Contains(name, "brânză") {
			allergens = []string{allergenMilk}
		}
		if strings.Contains(name, "caesar") {
			ingredients = ls(
				"Салат романо, курица, гренки из белого хлеба, пармезан, соус цезарь (яйцо, анчоусы, масло).",
				"Romaine, chicken, white-bread croutons, parmesan, Caesar dressing (egg, anchovy, oil).",
				"Salată romană, pui, crutoane din pâine albă, parmezan, sos Caesar (ou, anșoa, ulei).",
			)
			allergens = []string{allergenGluten, allergenMilk, allergenEggs, allergenFish}
		}
		if strings.Contains(name, "tuna") {
			allergens = append(allergens, allergenFish, allergenEggs)
		}
	case strings.Contains(name, "pasta") || strings.Contains(name, "spaghetti") || strings.Contains(name, "penne") || strings.Contains(name, "tagliatelle") || strings.Contains(name, "linguine") || strings.Contains(name, "risotto"):
		ingredients = ls(
			"Паста из твёрдых сортов пшеницы, соус по рецепту, сыр пармезан, оливковое масло, специи.",
			"Durum-wheat pasta, sauce as listed, parmesan, olive oil, spices.",
			"Paste din grâu dur, sos după rețetă, parmezan, ulei de măsline, condimente.",
		)
		allergens = []string{allergenGluten, allergenMilk}
		if strings.Contains(name, "carbonara") {
			ingredients = ls(
				"Спагетти, гуанчале, яичный желток, пекорино романо, чёрный перец.",
				"Spaghetti, guanciale, egg yolk, pecorino romano, black pepper.",
				"Spaghetti, guanciale, gălbenuș, pecorino romano, piper negru.",
			)
			allergens = []string{allergenGluten, allergenEggs, allergenMilk}
		}
		if strings.Contains(name, "seafood") {
			allergens = append(allergens, allergenCrustaceans, allergenMolluscs, allergenFish)
		}
		if strings.Contains(name, "risotto") {
			ingredients = ls(
				"Рис арборио, белые грибы, лук, белое вино, бульон, пармезан, сливочное масло, трюфельное масло.",
				"Arborio rice, porcini, onion, white wine, stock, parmesan, butter, truffle oil.",
				"Orez arborio, hribi, ceapă, vin alb, supă, parmezan, unt, ulei de trufe.",
			)
			allergens = []string{allergenMilk, allergenSulphites}
		}
	case strings.Contains(name, "pizza") || strings.Contains(name, "margherita") || strings.Contains(name, "diavola") || strings.Contains(name, "pepperoni"):
		ingredients = ls(
			"Тесто из пшеничной муки, томатный соус, моцарелла, оливковое масло, специи; топпинги по рецепту.",
			"Wheat-flour dough, tomato sauce, mozzarella, olive oil, spices; toppings as listed.",
			"Aluat din făină de grâu, sos de roșii, mozzarella, ulei de măsline, condimente; toppinguri după rețetă.",
		)
		allergens = []string{allergenGluten, allergenMilk}
	case strings.Contains(name, "burger"):
		ingredients = ls(
			"Булочка бриошь, котлета, сыр, овощи, соус домашнего приготовления; гарнир по желанию.",
			"Brioche bun, patty, cheese, vegetables, house sauce; side as ordered.",
			"Chiflă brioche, chiftea, cașcaval, legume, sos de casă; garnitură la cerere.",
		)
		allergens = []string{allergenGluten, allergenMilk, allergenEggs, allergenMustard, allergenSesame}
		if strings.Contains(name, "veggie") || strings.Contains(name, "vegetarian") {
			allergens = []string{allergenGluten, allergenSesame, allergenSoy}
		}
	case strings.Contains(name, "steak") || strings.Contains(name, "ribeye") || strings.Contains(name, "filet") || strings.Contains(name, "striploin") || strings.Contains(name, "grill") || strings.Contains(name, "chop") || strings.Contains(name, "ribs") || strings.Contains(name, "sausage") || strings.Contains(name, "medallion") || strings.Contains(name, "cheek") || strings.Contains(name, "lamb"):
		ingredients = ls(
			"Мясо выбранного отруба, соль, перец, растительное масло; соус и гарнир по подаче.",
			"Selected cut of meat, salt, pepper, oil; sauce and sides as served.",
			"Carne din tăietura aleasă, sare, piper, ulei; sos și garnituri după preparat.",
		)
		if strings.Contains(name, "wine") {
			allergens = []string{allergenSulphites}
		}
	case strings.Contains(name, "sushi") || strings.Contains(name, "roll") || strings.Contains(name, "nigiri") || strings.Contains(name, "philadelphia") || strings.Contains(name, "dragon") || strings.Contains(name, "california"):
		ingredients = ls(
			"Рис для суши, нори, лосось/тунец/креветка, сливочный сыр или авокадо, соевый соус, васаби.",
			"Sushi rice, nori, salmon/tuna/prawn, cream cheese or avocado, soy sauce, wasabi.",
			"Orez pentru sushi, nori, somon/ton/crevete, cremă de brânză sau avocado, sos de soia, wasabi.",
		)
		allergens = []string{allergenFish, allergenCrustaceans, allergenSoy, allergenSesame}
		if strings.Contains(name, "philadelphia") {
			allergens = append(allergens, allergenMilk)
		}
	case strings.Contains(name, "ramen") || strings.Contains(name, "tom yum") || strings.Contains(name, "teriyaki") || strings.Contains(name, "edamame") || strings.Contains(name, "wakame") || strings.Contains(name, "tempura"):
		ingredients = ls(
			"Бульон или лапша/рис по рецепту, соевый соус, кунжут, зелёный лук, специи.",
			"Broth or noodles/rice as listed, soy sauce, sesame, spring onion, spices.",
			"Supă sau tăiței/orez după rețetă, sos de soia, susan, ceapă verde, condimente.",
		)
		allergens = []string{allergenSoy, allergenSesame, allergenGluten}
		if strings.Contains(name, "tempura") || strings.Contains(name, "tom yum") {
			allergens = append(allergens, allergenCrustaceans, allergenEggs)
		}
	case strings.Contains(name, "mochi") || strings.Contains(name, "matcha") || strings.Contains(name, "eclair") || strings.Contains(name, "tart") || strings.Contains(name, "brioche") || strings.Contains(name, "granola"):
		if d.desc.RU != "" {
			ingredients = d.desc
		}
		if strings.Contains(name, "matcha") && strings.Contains(name, "latte") || strings.Contains(name, "raf") {
			allergens = []string{allergenMilk}
		} else {
			allergens = []string{allergenMilk, allergenEggs, allergenGluten}
		}
	case strings.Contains(name, "trout") || strings.Contains(name, "sea bass") || strings.Contains(name, "lavrac") || strings.Contains(name, "tuna") || strings.Contains(name, "salmon") || strings.Contains(name, "dorad") || strings.Contains(name, "bream") || strings.Contains(name, "fish"):
		ingredients = ls(
			"Филе рыбы, лимон, оливковое масло, травы, овощи на гарнир.",
			"Fish fillet, lemon, olive oil, herbs, vegetable garnish.",
			"File de pește, lămâie, ulei de măsline, ierburi, garnitură de legume.",
		)
		allergens = []string{allergenFish}
	case strings.Contains(name, "seafood") || strings.Contains(name, "prawn") || strings.Contains(name, "shrimp") || strings.Contains(name, "creve"):
		ingredients = ls(
			"Морепродукты, тесто темпура или масло для гриля, соус, зелень.",
			"Seafood, tempura batter or grill oil, sauce, greens.",
			"Fructe de mare, aluat tempura sau ulei pentru grătar, sos, verdeață.",
		)
		allergens = []string{allergenCrustaceans, allergenGluten}
	case strings.Contains(name, "chicken") || strings.Contains(name, "wing") || strings.Contains(name, "nugget") || strings.Contains(name, "duck"):
		ingredients = ls(
			"Мясо птицы, маринад или панировка, специи; соус в комплекте.",
			"Poultry, marinade or breading, spices; sauce included.",
			"Carne de pasăre, marinadă sau pane, condimente; sos inclus.",
		)
		if strings.Contains(name, "nugget") || strings.Contains(name, "wing") || strings.Contains(name, "strip") || strings.Contains(name, "tempura") {
			allergens = []string{allergenGluten, allergenEggs}
		}
	case strings.Contains(name, "dessert") || strings.Contains(name, "cheesecake") || strings.Contains(name, "tiramisu") || strings.Contains(name, "fondant") || strings.Contains(name, "brownie") || strings.Contains(name, "panna") || strings.Contains(name, "crème") || strings.Contains(name, "cake") || strings.Contains(name, "pie") || strings.Contains(name, "pancake") || strings.Contains(name, "papana") || strings.Contains(name, "ice cream") || strings.Contains(name, "pear"):
		ingredients = ls(
			"Молочные продукты, сахар, яйца, мука или основа по рецепту; топпинг по подаче.",
			"Dairy, sugar, eggs, flour or base as listed; topping as served.",
			"Produse lactate, zahăr, ouă, făină sau blat după rețetă; topping la servire.",
		)
		allergens = []string{allergenMilk, allergenEggs, allergenGluten}
		if strings.Contains(name, "ice cream") {
			allergens = []string{allergenMilk}
		}
		if strings.Contains(name, "tiramisu") {
			allergens = []string{allergenMilk, allergenEggs, allergenGluten, allergenSoy}
		}
		if strings.Contains(name, "nut") || strings.Contains(name, "almond") || strings.Contains(name, "praline") {
			allergens = append(allergens, allergenNuts)
		}
	case strings.Contains(name, "coffee") || strings.Contains(name, "espresso") || strings.Contains(name, "cappuccino") || strings.Contains(name, "flat white") || strings.Contains(name, "raf") || strings.Contains(name, "milkshake"):
		ingredients = ls(
			"Зёрна арабики, вода; молоко или сливки — по выбранному напитку.",
			"Arabica beans, water; milk or cream depending on the drink.",
			"Boabe arabica, apă; lapte sau frișcă, în funcție de băutură.",
		)
		if !strings.Contains(name, "espresso") || strings.Contains(name, "cappuccino") || strings.Contains(name, "flat") || strings.Contains(name, "raf") || strings.Contains(name, "shake") {
			allergens = []string{allergenMilk}
		}
	case strings.Contains(name, "tea") || strings.Contains(name, "lemonade") || strings.Contains(name, "compote") || strings.Contains(name, "juice") || strings.Contains(name, "fresh") || strings.Contains(name, "breeze"):
		ingredients = ls(
			"Вода, фрукты или травы по рецепту, сахар или мёд по вкусу.",
			"Water, fruit or herbs as listed, sugar or honey to taste.",
			"Apă, fructe sau plante după rețetă, zahăr sau miere după gust.",
		)
	case strings.Contains(name, "bruschett") || strings.Contains(name, "antipast") || strings.Contains(name, "vitello") || strings.Contains(name, "carpaccio") || strings.Contains(name, "arancin"):
		// Prefer the dish description — demo copy already lists the composition.
		if d.desc.RU != "" {
			ingredients = d.desc
		} else {
			ingredients = ls(
				"Хлеб или основа, овощи или начинка по рецепту, оливковое масло, специи.",
				"Bread or base, vegetables or filling as listed, olive oil, spices.",
				"Pâine sau bază, legume sau umplutură după rețetă, ulei de măsline, condimente.",
			)
		}
		if strings.Contains(name, "bruschett") || strings.Contains(name, "arancin") {
			allergens = []string{allergenGluten}
		}
		if strings.Contains(name, "cheese") || strings.Contains(name, "mozzarella") || strings.Contains(name, "parmesan") || strings.Contains(name, "tonnato") {
			allergens = append(allergens, allergenMilk)
		}
		if strings.Contains(name, "tonnato") || strings.Contains(name, "anchov") {
			allergens = append(allergens, allergenFish, allergenEggs)
		}
	case strings.Contains(name, "beer") || strings.Contains(name, "lager") || strings.Contains(name, "stout") || containsWord(name, "ipa"):
		ingredients = ls(
			"Вода, солод, хмель, дрожжи.",
			"Water, malt, hops, yeast.",
			"Apă, malț, hamei, drojdie.",
		)
		allergens = []string{allergenGluten}
	case strings.Contains(name, "wine") || strings.Contains(name, "prosecco") || strings.Contains(name, "purcari") || strings.Contains(name, "fetească") || strings.Contains(name, "cricova") || strings.Contains(name, "flight"):
		ingredients = ls(
			"Виноградный сок, прошедший брожение; содержит сульфиты.",
			"Fermented grape must; contains sulphites.",
			"Must de struguri fermentat; conține sulfiți.",
		)
		allergens = []string{allergenSulphites}
	case strings.Contains(name, "cocktail") || strings.Contains(name, "mojito") || strings.Contains(name, "martini") || strings.Contains(name, "negroni") || strings.Contains(name, "aperol") || strings.Contains(name, "sour") || strings.Contains(name, "spritz"):
		ingredients = ls(
			"Крепкий алкоголь или аперитив по рецепту, цитрус, сироп или газированная вода, лёд.",
			"Spirit or aperitif as listed, citrus, syrup or soda, ice.",
			"Alcool tare sau aperitiv după rețetă, citrice, sirop sau sifon, gheață.",
		)
		allergens = []string{allergenSulphites}
	case strings.Contains(name, "platter") || strings.Contains(name, "board") || strings.Contains(name, "charcuterie") || strings.Contains(name, "cheese") || strings.Contains(name, "brânză") || strings.Contains(name, "nachos"):
		ingredients = ls(
			"Ассорти сыров и/или мясных деликатесов, хлеб или гриссини, мёд, орехи, оливки — по составу тарелки.",
			"Assorted cheeses and/or cured meats, bread or grissini, honey, nuts, olives — as plated.",
			"Asortiment de brânzeturi și/sau mezeluri, pâine sau grissini, miere, nuci, măsline — după platou.",
		)
		allergens = []string{allergenMilk, allergenGluten, allergenNuts}
	case strings.Contains(name, "fries") || strings.Contains(name, "wedge") || strings.Contains(name, "onion"):
		ingredients = ls(
			"Картофель или овощи, растительное масло, соль, специи; соус отдельно.",
			"Potato or vegetables, vegetable oil, salt, spices; dip on the side.",
			"Cartofi sau legume, ulei vegetal, sare, condimente; sos separat.",
		)
	case strings.Contains(name, "breakfast") || strings.Contains(name, "omelette") || strings.Contains(name, "syrniki") || strings.Contains(name, "toast") || strings.Contains(name, "croissant") || strings.Contains(name, "quiche") || strings.Contains(name, "sandwich"):
		ingredients = ls(
			"Яйца или выпечка, молочные продукты, овощи или начинка по рецепту, специи.",
			"Eggs or pastry, dairy, vegetables or filling as listed, spices.",
			"Ouă sau patiserie, lactate, legume sau umplutură după rețetă, condimente.",
		)
		allergens = []string{allergenEggs, allergenMilk, allergenGluten}
	case strings.Contains(name, "sarmale") || strings.Contains(name, "tochitur") || strings.Contains(name, "mititei") || strings.Contains(name, "mămălig") || strings.Contains(name, "mamalig"):
		ingredients = ls(
			"Традиционные молдавские продукты: мясо или мамалыга, брынза, сметана, специи — по блюду.",
			"Traditional Moldovan ingredients: meat or mămăligă, brânză, sour cream, spices — as plated.",
			"Ingrediente moldovenești: carne sau mămăligă, brânză, smântână, condimente — după preparat.",
		)
		allergens = []string{allergenMilk}
		if strings.Contains(name, "sarmale") {
			allergens = append(allergens, allergenCelery)
		}
	default:
		if d.desc.RU != "" {
			ingredients = d.desc
		} else {
			ingredients = ls(
				"Состав уточняйте у официанта — меню может меняться.",
				"Ask your waiter for the full composition — the menu may change.",
				"Cereți chelnerului compoziția completă — meniul se poate schimba.",
			)
		}
	}

	if d.alcohol && !containsAllergen(allergens, allergenSulphites) &&
		(strings.Contains(name, "wine") || strings.Contains(name, "cocktail") || strings.Contains(name, "beer")) {
		allergens = append(allergens, allergenSulphites)
	}
	return ingredients, uniqStrings(allergens)
}
