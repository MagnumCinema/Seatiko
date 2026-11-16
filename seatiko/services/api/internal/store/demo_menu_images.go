package store

import "strings"

// Unsplash food photos used for the demo menu thumbnails (square crops).
const (
	imgPlacinta   = "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=400&h=400&q=80"
	imgCheese     = "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=400&h=400&q=80"
	imgSalad      = "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=400&h=400&q=80"
	imgSoup       = "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=400&h=400&q=80"
	imgSteak      = "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&h=400&q=80"
	imgGrill      = "https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=400&h=400&q=80"
	imgBurger     = "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&h=400&q=80"
	imgFries      = "https://images.unsplash.com/photo-1576107233122-9590b0d7e9f2?auto=format&fit=crop&w=400&h=400&q=80"
	imgPasta      = "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=400&h=400&q=80"
	imgPizza      = "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=400&h=400&q=80"
	imgSeafood    = "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=400&h=400&q=80"
	imgSalmon     = "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=400&h=400&q=80"
	imgChicken    = "https://images.unsplash.com/photo-1598103442097-8b74394b95c6?auto=format&fit=crop&w=400&h=400&q=80"
	imgWings      = "https://images.unsplash.com/photo-1527477396000-e27170b114b2?auto=format&fit=crop&w=400&h=400&q=80"
	imgBreakfast  = "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=400&h=400&q=80"
	imgToast      = "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=400&h=400&q=80"
	imgDessert    = "https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=400&h=400&q=80"
	imgCheesecake = "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=400&h=400&q=80"
	imgTiramisu   = "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=400&h=400&q=80"
	imgCoffee     = "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=400&h=400&q=80"
	imgTea        = "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&h=400&q=80"
	imgLemonade   = "https://images.unsplash.com/photo-1523677011782-c13c525961c0?auto=format&fit=crop&w=400&h=400&q=80"
	imgBeer       = "https://images.unsplash.com/photo-1608270586620-248524c67de9?auto=format&fit=crop&w=400&h=400&q=80"
	imgWine       = "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=400&h=400&q=80"
	imgCocktail   = "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=400&h=400&q=80"
	imgPlatter    = "https://images.unsplash.com/photo-1541529086526-db283c563270?auto=format&fit=crop&w=400&h=400&q=80"
	imgMamaliga   = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&h=400&q=80"
	imgSarmale    = "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=400&h=400&q=80"
	imgKids       = "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=400&h=400&q=80"
	imgNuggets    = "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=400&h=400&q=80"
	imgIceCream   = "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=400&h=400&q=80"
	imgRisotto    = "https://images.unsplash.com/photo-1476124369491-e7addf5db371?auto=format&fit=crop&w=400&h=400&q=80"
	imgDuck       = "https://images.unsplash.com/photo-1432139555190-58524dae6a55?auto=format&fit=crop&w=400&h=400&q=80"
	imgDefault    = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=400&h=400&q=80"
)

// demoDishImage picks a stock photo for a seeded dish from its English name and category.
func demoDishImage(d demoDish) string {
	name := strings.ToLower(d.name.EN + " " + d.category.EN)
	switch {
	case strings.Contains(name, "plăcint") || strings.Contains(name, "placint"):
		return imgPlacinta
	case strings.Contains(name, "papana") || strings.Contains(name, "cheesecake"):
		return imgCheesecake
	case strings.Contains(name, "tiramisu"):
		return imgTiramisu
	case strings.Contains(name, "ice cream") || strings.Contains(name, "îngheț"):
		return imgIceCream
	case strings.Contains(name, "mămălig") || strings.Contains(name, "mamalig"):
		return imgMamaliga
	case strings.Contains(name, "sarmale") || strings.Contains(name, "tochitur") || strings.Contains(name, "mititei"):
		return imgSarmale
	case strings.Contains(name, "nugget"):
		return imgNuggets
	case strings.Contains(name, "wing"):
		return imgWings
	case strings.Contains(name, "burger"):
		return imgBurger
	case strings.Contains(name, "fries") || strings.Contains(name, "wedge") || strings.Contains(name, "onion ring") || strings.Contains(name, "batat"):
		return imgFries
	case strings.Contains(name, "pizza") || strings.Contains(name, "margherita") || strings.Contains(name, "diavola") || strings.Contains(name, "pepperoni") || strings.Contains(name, "prosciutto"):
		return imgPizza
	case strings.Contains(name, "pasta") || strings.Contains(name, "spaghetti") || strings.Contains(name, "penne") || strings.Contains(name, "tagliatelle") || strings.Contains(name, "linguine") || strings.Contains(name, "carbonara"):
		return imgPasta
	case strings.Contains(name, "risotto"):
		return imgRisotto
	case strings.Contains(name, "ribeye") || strings.Contains(name, "filet") || strings.Contains(name, "striploin") || strings.Contains(name, "steak") || strings.Contains(name, "medallion") || strings.Contains(name, "cheek"):
		return imgSteak
	case strings.Contains(name, "grill") || strings.Contains(name, "chop") || strings.Contains(name, "ribs") || strings.Contains(name, "sausage"):
		return imgGrill
	case strings.Contains(name, "duck"):
		return imgDuck
	case strings.Contains(name, "salmon") || strings.Contains(name, "dorad") || strings.Contains(name, "bream"):
		return imgSalmon
	case strings.Contains(name, "seafood") || strings.Contains(name, "prawn") || strings.Contains(name, "shrimp") || strings.Contains(name, "creve"):
		return imgSeafood
	case strings.Contains(name, "chicken") || strings.Contains(name, "pui"):
		return imgChicken
	case strings.Contains(name, "tartare") || strings.Contains(name, "carpaccio") || strings.Contains(name, "bruschetta") || strings.Contains(name, "antipast") || strings.Contains(name, "starter"):
		if strings.Contains(name, "cheese") || strings.Contains(name, "brânză") || strings.Contains(name, "brinza") {
			return imgCheese
		}
		return imgPlatter
	case strings.Contains(name, "platter") || strings.Contains(name, "board") || strings.Contains(name, "charcuterie") || strings.Contains(name, "nachos"):
		return imgPlatter
	case strings.Contains(name, "salad") || strings.Contains(name, "caprese") || strings.Contains(name, "burrata") || strings.Contains(name, "caesar"):
		return imgSalad
	case strings.Contains(name, "soup") || strings.Contains(name, "borscht") || strings.Contains(name, "zeam") || strings.Contains(name, "ciorb"):
		return imgSoup
	case strings.Contains(name, "breakfast") || strings.Contains(name, "omelette") || strings.Contains(name, "syrniki") || strings.Contains(name, "quiche") || strings.Contains(name, "sandwich"):
		return imgBreakfast
	case strings.Contains(name, "toast") || strings.Contains(name, "croissant"):
		return imgToast
	case strings.Contains(name, "dessert") || strings.Contains(name, "fondant") || strings.Contains(name, "brownie") || strings.Contains(name, "panna") || strings.Contains(name, "crème") || strings.Contains(name, "cake") || strings.Contains(name, "pie") || strings.Contains(name, "pancake") || strings.Contains(name, "pear"):
		return imgDessert
	case strings.Contains(name, "coffee") || strings.Contains(name, "espresso") || strings.Contains(name, "cappuccino") || strings.Contains(name, "flat white") || strings.Contains(name, "raf") || strings.Contains(name, "milkshake"):
		return imgCoffee
	case strings.Contains(name, "tea"):
		return imgTea
	case strings.Contains(name, "lemonade") || strings.Contains(name, "compote") || strings.Contains(name, "juice") || strings.Contains(name, "fresh"):
		return imgLemonade
	case strings.Contains(name, "beer") || strings.Contains(name, "lager") || strings.Contains(name, "ipa") || strings.Contains(name, "stout"):
		return imgBeer
	case strings.Contains(name, "wine") || strings.Contains(name, "prosecco") || strings.Contains(name, "purcari") || strings.Contains(name, "fetească") || strings.Contains(name, "cricova") || strings.Contains(name, "asconi") || strings.Contains(name, "castel") || strings.Contains(name, "et cetera") || strings.Contains(name, "pinot") || strings.Contains(name, "flight"):
		return imgWine
	case strings.Contains(name, "cocktail") || strings.Contains(name, "mojito") || strings.Contains(name, "martini") || strings.Contains(name, "negroni") || strings.Contains(name, "aperol") || strings.Contains(name, "sour") || strings.Contains(name, "spritz") || strings.Contains(name, "breeze"):
		return imgCocktail
	case strings.Contains(name, "kids") || strings.Contains(name, "mini"):
		return imgKids
	case strings.Contains(name, "cheese") || strings.Contains(name, "brânză") || strings.Contains(name, "mozzarella"):
		return imgCheese
	case d.alcohol:
		if strings.Contains(d.category.EN, "Beer") {
			return imgBeer
		}
		if strings.Contains(d.category.EN, "Wine") {
			return imgWine
		}
		return imgCocktail
	case strings.Contains(d.category.EN, "Pizza"):
		return imgPizza
	case strings.Contains(d.category.EN, "Pasta"):
		return imgPasta
	case strings.Contains(d.category.EN, "Salad"):
		return imgSalad
	case strings.Contains(d.category.EN, "Soup"):
		return imgSoup
	case strings.Contains(d.category.EN, "Dessert"):
		return imgDessert
	case strings.Contains(d.category.EN, "Coffee"):
		return imgCoffee
	case strings.Contains(d.category.EN, "Beer"):
		return imgBeer
	case strings.Contains(d.category.EN, "Burger"):
		return imgBurger
	case strings.Contains(d.category.EN, "Breakfast"):
		return imgBreakfast
	case strings.Contains(d.category.EN, "Steak") || strings.Contains(d.category.EN, "Grill"):
		return imgSteak
	case strings.Contains(d.category.EN, "Wine"):
		return imgWine
	case strings.Contains(d.category.EN, "Cocktail") || strings.Contains(d.category.EN, "Drink"):
		return imgLemonade
	case strings.Contains(d.category.EN, "Kids"):
		return imgKids
	case strings.Contains(d.category.EN, "Side"):
		return imgFries
	default:
		return imgDefault
	}
}
