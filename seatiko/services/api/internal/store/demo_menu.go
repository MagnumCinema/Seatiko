package store

import "github.com/seatiko/api/internal/models"

// demoMenuVersion is bumped whenever demoMenu gains dishes, so persisted
// snapshots pick up the new seed once without resurrecting dishes owners deleted.
const demoMenuVersion = 6

const (
	tagPopular    = "popular"
	tagVegetarian = "vegetarian"
	tagSpicy      = "spicy"
)

func ls(ru, en, ro string) models.LocalizedString {
	return models.LocalizedString{RU: ru, EN: en, RO: ro}
}

func tags(t ...string) []string { return t }

type demoDish struct {
	id       string
	category models.LocalizedString
	name     models.LocalizedString
	desc     models.LocalizedString
	price    int
	weightG  int
	volumeML int
	alcohol  bool
	tags     []string
}

// demoMenu returns the seeded menu of every demo venue. Dishes keep the order
// they are listed in: it drives both the category order and the dish order.
func demoMenu() []models.MenuItem {
	var (
		starters   = ls("Закуски", "Starters", "Aperitive")
		salads     = ls("Салаты", "Salads", "Salate")
		soups      = ls("Супы", "Soups", "Supe")
		mains      = ls("Горячее", "Main courses", "Feluri principale")
		sides      = ls("Гарниры", "Sides", "Garnituri")
		desserts   = ls("Десерты", "Desserts", "Deserturi")
		drinks     = ls("Напитки", "Drinks", "Băuturi")
		placinte   = ls("Плацинды", "Plăcinte", "Plăcinte")
		breakfast  = ls("Завтраки", "Breakfast", "Mic dejun")
		lunch      = ls("Лёгкий обед", "Light lunch", "Prânz ușor")
		coffee     = ls("Кофе", "Coffee", "Cafea")
		teaLemon   = ls("Чай и лимонады", "Tea & lemonades", "Ceai și limonade")
		steaks     = ls("Стейки и гриль", "Steaks & grill", "Steak-uri și grătar")
		wineBar    = ls("Вино и бар", "Wine & bar", "Vin și bar")
		antipasti  = ls("Антипасти", "Antipasti", "Antipasti")
		pasta      = ls("Паста", "Pasta", "Paste")
		woodPizza  = ls("Пицца из дровяной печи", "Wood-fired pizza", "Pizza din cuptor cu lemne")
		beerSnacks = ls("Закуски к пиву", "Beer snacks", "Gustări la bere")
		grill      = ls("Гриль и стейки", "Grill & steaks", "Grătar și steak-uri")
		burgers    = ls("Бургеры", "Burgers", "Burgeri")
		beer       = ls("Пиво", "Beer", "Bere")
		drinksWine = ls("Напитки и вино", "Drinks & wine", "Băuturi și vin")
		drinksBar  = ls("Напитки и коктейли", "Drinks & cocktails", "Băuturi și cocktailuri")
		cocktails  = ls("Коктейли и напитки", "Cocktails & drinks", "Cocktailuri și băuturi")
		platters   = ls("Тарелки к вину", "Wine platters", "Platouri la vin")
		startSalad = ls("Закуски и салаты", "Starters & salads", "Aperitive și salate")
		wineGlass  = ls("Вино по бокалам", "Wine by the glass", "Vin la pahar")
		pizza      = ls("Пицца", "Pizza", "Pizza")
		kids       = ls("Детское меню", "Kids' menu", "Meniu pentru copii")
		rolls      = ls("Роллы и суши", "Rolls & sushi", "Rulouri și sushi")
		ramen      = ls("Рамен и вок", "Ramen & bowls", "Ramen și wok")
		seafood    = ls("Морепродукты и рыба", "Seafood & fish", "Fructe de mare și pește")
		patisserie = ls("Выпечка и круассаны", "Bakery & croissants", "Patiserie și croissante")
		matchaBar  = ls("Кофе и матча", "Coffee & matcha", "Cafea și matcha")
	)

	menus := map[string][]demoDish{
		// La Plăcinte — Moldovan cuisine and pastries.
		"venue-1": {
			{id: "m-v1-01", category: starters, name: ls("Брынза с зеленью и овощами", "Brânză with herbs and vegetables", "Brânză cu verdeață și legume"), desc: ls("Овечья брынза, томаты, огурцы, зелёный лук", "Sheep cheese, tomatoes, cucumbers, spring onion", "Brânză de oi, roșii, castraveți, ceapă verde"), price: 85, weightG: 220, tags: tags(tagVegetarian)},
			{id: "m-v1-02", category: starters, name: ls("Салат из свежих овощей с брынзой", "Fresh vegetable salad with brânză", "Salată de legume proaspete cu brânză"), desc: ls("Заправка из подсолнечного масла и зелени", "Dressed with sunflower oil and herbs", "Cu ulei de floarea-soarelui și verdeață"), price: 70, weightG: 250, tags: tags(tagVegetarian)},
			{id: "m2", category: soups, name: ls("Зелёный борщ", "Green borscht", "Borș verde"), desc: ls("Со щавелем, яйцом и сметаной", "With sorrel, egg and sour cream", "Cu măcriș, ou și smântână"), price: 65, weightG: 350},
			{id: "m-v1-03", category: soups, name: ls("Зама с домашней лапшой", "Zeamă with homemade noodles", "Zeamă cu tăiței de casă"), desc: ls("Куриный суп с любистоком, кисловатый, как дома", "Tangy chicken soup with lovage, just like at home", "Supă de găină acrișoară cu leuștean, ca acasă"), price: 60, weightG: 350, tags: tags(tagPopular)},
			{id: "m1", category: placinte, name: ls("Плацинда с брынзой", "Cheese plăcintă", "Plăcintă cu brânză"), desc: ls("Тонкое тянутое тесто, овечья брынза и зелень", "Thin stretched dough, sheep cheese and herbs", "Aluat întins subțire, brânză de oi și verdeață"), price: 45, weightG: 250, tags: tags(tagPopular, tagVegetarian)},
			{id: "m-v1-04", category: placinte, name: ls("Плацинда с картофелем", "Potato plăcintă", "Plăcintă cu cartofi"), desc: ls("С жареным луком и укропом", "With fried onion and dill", "Cu ceapă prăjită și mărar"), price: 40, weightG: 250, tags: tags(tagVegetarian)},
			{id: "m-v1-05", category: placinte, name: ls("Плацинда с капустой", "Cabbage plăcintă", "Plăcintă cu varză"), desc: ls("Тушёная капуста с морковью", "Braised cabbage with carrot", "Varză călită cu morcov"), price: 40, weightG: 250, tags: tags(tagVegetarian)},
			{id: "m-v1-06", category: placinte, name: ls("Плацинда с тыквой", "Pumpkin plăcintă", "Plăcintă cu dovleac"), desc: ls("Сладкая тыква с корицей", "Sweet pumpkin with cinnamon", "Dovleac dulce cu scorțișoară"), price: 42, weightG: 250, tags: tags(tagVegetarian)},
			{id: "m-v1-07", category: mains, name: ls("Мамалыга с брынзой и сметаной", "Mămăligă with brânză and sour cream", "Mămăligă cu brânză și smântână"), desc: ls("Кукурузная каша по-молдавски", "Moldovan cornmeal porridge", "Mămăligă moldovenească tradițională"), price: 75, weightG: 350, tags: tags(tagVegetarian)},
			{id: "m-v1-08", category: mains, name: ls("Сармале с мамалыгой", "Sarmale with mămăligă", "Sarmale cu mămăligă"), desc: ls("Голубцы в виноградных листьях со сметаной", "Rice and pork rolls in vine leaves, sour cream", "Sarmale în foi de viță, cu smântână"), price: 110, weightG: 350},
			{id: "m-v1-09", category: mains, name: ls("Токитурэ по-молдавски", "Moldovan tochitură", "Tochitură moldovenească"), desc: ls("Свинина, колбаски, мамалыга, брынза и яйцо", "Pork, sausages, mămăligă, brânză and a fried egg", "Carne de porc, cârnăciori, mămăligă, brânză și ou"), price: 145, weightG: 450, tags: tags(tagPopular)},
			{id: "m-v1-14", category: mains, name: ls("Костицэ на гратаре с чесночным муждеем", "Charcoal pork ribs with mujdei", "Costiță la grătar cu mujdei"), desc: ls("Свиные рёбрышки с печёным картофелем и солёными огурцами", "Charcoal ribs with roasted potato and pickles", "Costiță la grătar cu cartofi copți și murături"), price: 155, weightG: 380, tags: tags(tagPopular)},
			{id: "m-v1-15", category: mains, name: ls("Мититеи домашние на углях", "Grilled homemade mititei", "Mititei de casă la grătar"), desc: ls("С горчицей, зелёным луком и свежим хлебом", "With mustard, spring onion and fresh bread", "Cu muștar, ceapă verde și pâine proaspătă"), price: 105, weightG: 280},
			{id: "m-v1-10", category: desserts, name: ls("Папанаши", "Papanași", "Papanași"), desc: ls("Пончики из творога со сметаной и вареньем", "Cottage-cheese doughnuts with sour cream and jam", "Gogoși de brânză cu smântână și dulceață"), price: 70, weightG: 200},
			{id: "m-v1-11", category: desserts, name: ls("Плацинда с вишней", "Sour cherry plăcintă", "Plăcintă cu vișine"), desc: ls("Сладкая плацинда с вишней и сахарной пудрой", "Sweet plăcintă with sour cherries and icing sugar", "Plăcintă dulce cu vișine și zahăr pudră"), price: 45, weightG: 220},
			{id: "m3", category: drinks, name: ls("Домашний компот", "Homemade compote", "Compot de casă"), desc: ls("Из сезонных фруктов", "Made from seasonal fruit", "Din fructe de sezon"), price: 25, volumeML: 300},
			{id: "m-v1-12", category: drinks, name: ls("Травяной чай с мёдом", "Herbal tea with honey", "Ceai din plante cu miere"), desc: ls("Чабрец, мята и липа", "Thyme, mint and linden", "Cimbru, mentă și tei"), price: 30, volumeML: 400},
			{id: "m-v1-13", category: drinks, name: ls("Домашнее вино, бокал", "House wine, glass", "Vin de casă, pahar"), desc: ls("Красное или белое на выбор", "Red or white", "Roșu sau alb, la alegere"), price: 45, volumeML: 150, alcohol: true},
		},

		// Cafe Central — coffee, breakfast and light lunch (no alcohol licence).
		"venue-2": {
			{id: "m5", category: breakfast, name: ls("Авокадо тост", "Avocado toast", "Toast cu avocado"), desc: ls("Зерновой хлеб, авокадо, яйцо пашот", "Wholegrain bread, avocado, poached egg", "Pâine integrală, avocado, ou poșat"), price: 75, weightG: 220, tags: tags(tagVegetarian)},
			{id: "m-v2-01", category: breakfast, name: ls("Сырники со сметаной и ягодами", "Syrniki with sour cream and berries", "Clătite de brânză cu smântână și fructe"), desc: ls("Творожные оладьи, как у бабушки", "Cottage-cheese pancakes, grandma style", "Pancakes din brânză de vaci, ca la bunica"), price: 65, weightG: 220, tags: tags(tagPopular, tagVegetarian)},
			{id: "m-v2-02", category: breakfast, name: ls("Омлет с сыром и зеленью", "Cheese and herb omelette", "Omletă cu brânză și verdeață"), desc: ls("Из трёх яиц, с тостом", "Three eggs, served with toast", "Din trei ouă, cu pâine prăjită"), price: 60, weightG: 230, tags: tags(tagVegetarian)},
			{id: "m-v2-03", category: breakfast, name: ls("Английский завтрак", "Full English breakfast", "Mic dejun englezesc"), desc: ls("Яйца, бекон, колбаски, фасоль, тост", "Eggs, bacon, sausages, beans, toast", "Ouă, bacon, cârnăciori, fasole, pâine prăjită"), price: 95, weightG: 380},
			{id: "m-v2-04", category: lunch, name: ls("Клаб-сэндвич с курицей", "Chicken club sandwich", "Club sandwich cu pui"), desc: ls("Курица, бекон, томаты, салат и фирменный соус", "Chicken, bacon, tomato, lettuce and house sauce", "Pui, bacon, roșii, salată și sos de casă"), price: 85, weightG: 300},
			{id: "m-v2-05", category: lunch, name: ls("Цезарь с курицей", "Chicken Caesar salad", "Salată Caesar cu pui"), desc: ls("Романо, гренки, пармезан, соус цезарь", "Romaine, croutons, parmesan, Caesar dressing", "Salată romană, crutoane, parmezan, sos Caesar"), price: 90, weightG: 280},
			{id: "m-v2-06", category: lunch, name: ls("Крем-суп из тыквы", "Pumpkin cream soup", "Supă cremă de dovleac"), desc: ls("Со сливками и тыквенными семечками", "With cream and pumpkin seeds", "Cu smântână și semințe de dovleac"), price: 60, weightG: 300, tags: tags(tagVegetarian)},
			{id: "m-v2-07", category: lunch, name: ls("Киш с лососем и шпинатом", "Salmon and spinach quiche", "Quiche cu somon și spanac"), desc: ls("Песочное тесто, сливочная заливка", "Shortcrust pastry with a creamy filling", "Aluat fraged cu umplutură cremoasă"), price: 80, weightG: 220},
			{id: "m6", category: desserts, name: ls("Чизкейк", "Cheesecake", "Cheesecake"), desc: ls("Нью-Йорк: нежный, сливочный, на песочной основе", "New York style, creamy on a biscuit base", "Stil New York, cremos, pe blat fraged"), price: 55, weightG: 150, tags: tags(tagPopular)},
			{id: "m-v2-08", category: desserts, name: ls("Круассан с миндалём", "Almond croissant", "Croissant cu migdale"), desc: ls("Свежая выпечка с миндальным кремом", "Freshly baked with almond cream", "Proaspăt copt, cu cremă de migdale"), price: 40, weightG: 100},
			{id: "m-v2-09", category: coffee, name: ls("Эспрессо", "Espresso", "Espresso"), desc: ls("Арабика средней обжарки", "Medium-roast arabica", "Arabica prăjită mediu"), price: 25, volumeML: 40},
			{id: "m4", category: coffee, name: ls("Капучино", "Cappuccino", "Cappuccino"), desc: ls("Двойной эспрессо с молоком", "Double espresso with milk", "Espresso dublu cu lapte"), price: 40, volumeML: 250, tags: tags(tagPopular)},
			{id: "m-v2-10", category: coffee, name: ls("Флэт уайт", "Flat white", "Flat white"), desc: ls("Насыщенный кофе с бархатным молоком", "Strong coffee with velvety milk", "Cafea intensă cu lapte catifelat"), price: 45, volumeML: 200},
			{id: "m-v2-11", category: coffee, name: ls("Раф ванильный", "Vanilla raf", "Raf cu vanilie"), desc: ls("Эспрессо, сливки и ваниль", "Espresso, cream and vanilla", "Espresso, frișcă și vanilie"), price: 50, volumeML: 300},
			{id: "m-v2-12", category: teaLemon, name: ls("Лимонад с мятой", "Mint lemonade", "Limonadă cu mentă"), desc: ls("Домашний, из свежих лимонов", "Homemade from fresh lemons", "De casă, din lămâi proaspete"), price: 45, volumeML: 400},
			{id: "m-v2-13", category: teaLemon, name: ls("Листовой чай, чайник", "Loose-leaf tea, pot", "Ceai la ceainic"), desc: ls("Чёрный, зелёный или травяной", "Black, green or herbal", "Negru, verde sau din plante"), price: 35, volumeML: 500},
		},

		// Steak House Balti — steaks and evening atmosphere.
		"venue-3": {
			{id: "m-v3-01", category: starters, name: ls("Тартар из говядины", "Beef tartare", "Tartar de vită"), desc: ls("Вырезка, каперсы, желток, гренки", "Tenderloin, capers, egg yolk, croutons", "Mușchi de vită, capere, gălbenuș, crutoane"), price: 185, weightG: 180, tags: tags(tagPopular)},
			{id: "m-v3-02", category: starters, name: ls("Карпаччо из говядины", "Beef carpaccio", "Carpaccio de vită"), desc: ls("С рукколой, пармезаном и лимонной заправкой", "With rocket, parmesan and lemon dressing", "Cu rucola, parmezan și dressing de lămâie"), price: 165, weightG: 150},
			{id: "m-v3-03", category: starters, name: ls("Салат с печёными овощами и козьим сыром", "Roasted vegetable salad with goat cheese", "Salată cu legume coapte și brânză de capră"), desc: ls("Перец, баклажан, цукини, бальзамик", "Peppers, aubergine, courgette, balsamic", "Ardei, vinete, dovlecei, balsamic"), price: 120, weightG: 250, tags: tags(tagVegetarian)},
			{id: "m7", category: steaks, name: ls("Рибай 300 г", "Ribeye 300 g", "Ribeye 300 g"), desc: ls("Мраморная говядина на гриле, medium rare", "Marbled beef off the grill, medium rare", "Vită marmorată la grătar, medium rare"), price: 320, weightG: 300, tags: tags(tagPopular)},
			{id: "m-v3-04", category: steaks, name: ls("Филе-миньон 250 г", "Filet mignon 250 g", "Filet mignon 250 g"), desc: ls("Нежная вырезка с соусом демиглас", "Tender beef fillet with demi-glace", "Mușchi fraged cu sos demi-glace"), price: 390, weightG: 250},
			{id: "m-v3-05", category: steaks, name: ls("Стриплойн 300 г", "Striploin 300 g", "Striploin 300 g"), desc: ls("Яркий мясной вкус, на углях", "Bold beefy flavour, charcoal-grilled", "Gust intens de vită, la cărbuni"), price: 340, weightG: 300},
			{id: "m-v3-06", category: steaks, name: ls("Свиная корейка на кости", "Bone-in pork chop", "Cotlet de porc cu os"), desc: ls("В остром маринаде с чили и паприкой", "In a hot chilli and paprika marinade", "Marinat picant cu chili și boia"), price: 190, weightG: 350, tags: tags(tagSpicy)},
			{id: "m-v3-07", category: steaks, name: ls("Куриная грудка на гриле", "Grilled chicken breast", "Piept de pui la grătar"), desc: ls("С травами и лимоном", "With herbs and lemon", "Cu ierburi și lămâie"), price: 150, weightG: 250},
			{id: "m8", category: sides, name: ls("Картофель фри", "French fries", "Cartofi prăjiți"), desc: ls("Хрустящий, с морской солью и соусом", "Crispy, with sea salt and a dip", "Crocanți, cu sare de mare și sos"), price: 45, weightG: 150, tags: tags(tagVegetarian)},
			{id: "m-v3-08", category: sides, name: ls("Пюре с трюфельным маслом", "Mash with truffle oil", "Piure cu ulei de trufe"), desc: ls("Сливочное картофельное пюре", "Creamy mashed potatoes", "Piure de cartofi cremos"), price: 60, weightG: 200, tags: tags(tagVegetarian)},
			{id: "m-v3-09", category: sides, name: ls("Овощи гриль", "Grilled vegetables", "Legume la grătar"), desc: ls("Сезонные овощи с оливковым маслом", "Seasonal vegetables with olive oil", "Legume de sezon cu ulei de măsline"), price: 65, weightG: 200, tags: tags(tagVegetarian)},
			{id: "m-v3-10", category: desserts, name: ls("Шоколадный фондан", "Chocolate fondant", "Fondant de ciocolată"), desc: ls("С жидкой серединкой и ванильным мороженым", "Molten centre, vanilla ice cream", "Cu miez lichid și înghețată de vanilie"), price: 85, weightG: 150},
			{id: "m9", category: wineBar, name: ls("Красное вино, бокал", "Red wine, glass", "Vin roșu, pahar"), desc: ls("Сухое красное молдавских виноделов", "Dry red from Moldovan winemakers", "Vin roșu sec de la vinificatori moldoveni"), price: 80, volumeML: 150, alcohol: true},
			{id: "m-v3-11", category: wineBar, name: ls("Negru de Purcari, бокал", "Negru de Purcari, glass", "Negru de Purcari, pahar"), desc: ls("Культовый красный купаж из Пуркарь", "Iconic red blend from Purcari", "Cupaj roșu emblematic de la Purcari"), price: 140, volumeML: 150, alcohol: true},
			{id: "m-v3-12", category: wineBar, name: ls("Разливное пиво", "Draught beer", "Bere la halbă"), desc: ls("Светлый лагер", "Pale lager", "Lager blond"), price: 55, volumeML: 500, alcohol: true},
		},

		// Oliva — Italian and Mediterranean, wood-fired pizza and pasta.
		"venue-4": {
			{id: "m-v4-01", category: antipasti, name: ls("Брускетта с томатами", "Tomato bruschetta", "Bruschetta cu roșii"), desc: ls("Чиабатта, томаты, чеснок, базилик", "Ciabatta, tomatoes, garlic, basil", "Ciabatta, roșii, usturoi, busuioc"), price: 65, weightG: 180, tags: tags(tagVegetarian)},
			{id: "m-v4-02", category: antipasti, name: ls("Вителло тоннато", "Vitello tonnato", "Vitello tonnato"), desc: ls("Телятина с тунцовым соусом и каперсами", "Veal with tuna sauce and capers", "Vițel cu sos de ton și capere"), price: 145, weightG: 180},
			{id: "m-v4-03", category: salads, name: ls("Капрезе", "Caprese", "Caprese"), desc: ls("Моцарелла, томаты, базилик, оливковое масло", "Mozzarella, tomatoes, basil, olive oil", "Mozzarella, roșii, busuioc, ulei de măsline"), price: 110, weightG: 250, tags: tags(tagVegetarian)},
			{id: "m-v4-04", category: salads, name: ls("Греческий салат", "Greek salad", "Salată grecească"), desc: ls("С фетой и оливками каламата", "With feta and Kalamata olives", "Cu feta și măsline Kalamata"), price: 95, weightG: 280, tags: tags(tagVegetarian)},
			{id: "m-v4-05", category: pasta, name: ls("Спагетти карбонара", "Spaghetti carbonara", "Spaghetti carbonara"), desc: ls("Гуанчале, желток, пекорино романо", "Guanciale, egg yolk, pecorino romano", "Guanciale, gălbenuș, pecorino romano"), price: 125, weightG: 300, tags: tags(tagPopular)},
			{id: "m-v4-06", category: pasta, name: ls("Пенне арраббьята", "Penne all'arrabbiata", "Penne all'arrabbiata"), desc: ls("Томатный соус с чесноком и чили", "Tomato sauce with garlic and chilli", "Sos de roșii cu usturoi și ardei iute"), price: 95, weightG: 300, tags: tags(tagVegetarian, tagSpicy)},
			{id: "m-v4-07", category: pasta, name: ls("Тальятелле с белыми грибами", "Tagliatelle with porcini", "Tagliatelle cu hribi"), desc: ls("В сливочном соусе с пармезаном", "In a creamy parmesan sauce", "În sos cremos cu parmezan"), price: 140, weightG: 300, tags: tags(tagVegetarian)},
			{id: "m-v4-08", category: pasta, name: ls("Лингвини с морепродуктами", "Seafood linguine", "Linguine cu fructe de mare"), desc: ls("Креветки, мидии, кальмар, томаты черри", "Prawns, mussels, squid, cherry tomatoes", "Creveți, midii, calamar, roșii cherry"), price: 175, weightG: 320},
			{id: "m-v4-09", category: woodPizza, name: ls("Маргарита", "Margherita", "Margherita"), desc: ls("Томаты сан-марцано, моцарелла, базилик", "San Marzano tomatoes, mozzarella, basil", "Roșii San Marzano, mozzarella, busuioc"), price: 105, weightG: 450, tags: tags(tagPopular, tagVegetarian)},
			{id: "m-v4-10", category: woodPizza, name: ls("Дьявола", "Diavola", "Diavola"), desc: ls("Острая салями, моцарелла, перец чили", "Spicy salami, mozzarella, chilli", "Salam picant, mozzarella, ardei iute"), price: 130, weightG: 480, tags: tags(tagSpicy)},
			{id: "m-v4-11", category: woodPizza, name: ls("Четыре сыра", "Quattro formaggi", "Quattro formaggi"), desc: ls("Моцарелла, горгонзола, пармезан, таледжо", "Mozzarella, gorgonzola, parmesan, taleggio", "Mozzarella, gorgonzola, parmezan, taleggio"), price: 140, weightG: 460, tags: tags(tagVegetarian)},
			{id: "m-v4-12", category: woodPizza, name: ls("Прошутто и руккола", "Prosciutto and rocket", "Prosciutto și rucola"), desc: ls("Пармская ветчина, руккола, пармезан", "Parma ham, rocket, parmesan", "Prosciutto di Parma, rucola, parmezan"), price: 150, weightG: 470},
			{id: "m-v4-18", category: woodPizza, name: ls("Трюфельная пицца с белыми грибами", "Truffle mushroom pizza", "Pizza cu trufe și hribi"), desc: ls("Сливочная основа, моцарелла, белые грибы, трюфельное масло", "Cream base, mozzarella, porcini mushrooms, truffle oil", "Bază cremoasă, mozzarella, hribi, ulei de trufe"), price: 165, weightG: 460, tags: tags(tagPopular, tagVegetarian)},
			{id: "m-v4-13", category: desserts, name: ls("Тирамису", "Tiramisu", "Tiramisu"), desc: ls("Классический, с маскарпоне и эспрессо", "Classic, with mascarpone and espresso", "Clasic, cu mascarpone și espresso"), price: 70, weightG: 150, tags: tags(tagPopular)},
			{id: "m-v4-14", category: desserts, name: ls("Панна-котта", "Panna cotta", "Panna cotta"), desc: ls("С ягодным соусом", "With berry coulis", "Cu sos de fructe de pădure"), price: 60, weightG: 150},
			{id: "m-v4-15", category: drinks, name: ls("Лимонад с базиликом и лаймом", "Basil and lime lemonade", "Limonadă cu busuioc și lime"), desc: ls("Освежающий, собственного приготовления", "Refreshing and homemade", "Răcoritoare, de casă"), price: 45, volumeML: 400},
			{id: "m-v4-16", category: drinks, name: ls("Апероль шприц", "Aperol Spritz", "Aperol Spritz"), desc: ls("Апероль, просекко, содовая, апельсин", "Aperol, prosecco, soda, orange", "Aperol, prosecco, sifon, portocală"), price: 110, volumeML: 250, alcohol: true},
			{id: "m-v4-17", category: drinks, name: ls("Пино гриджо, бокал", "Pinot Grigio, glass", "Pinot Grigio, pahar"), desc: ls("Лёгкое белое сухое", "Light dry white", "Vin alb sec, ușor"), price: 70, volumeML: 150, alcohol: true},
		},

		// Beermaster Pub — craft beer, steaks and grilled bites.
		"venue-5": {
			{id: "m-v5-01", category: beerSnacks, name: ls("Куриные крылья баффало", "Buffalo chicken wings", "Aripioare de pui Buffalo"), desc: ls("Острый соус и дип с блю-чиз", "Hot sauce and blue cheese dip", "Sos picant și dip cu blue cheese"), price: 95, weightG: 350, tags: tags(tagPopular, tagSpicy)},
			{id: "m-v5-02", category: beerSnacks, name: ls("Чесночные гренки", "Garlic croutons", "Crutoane cu usturoi"), desc: ls("Ржаные, с сырным соусом", "Rye bread, with cheese sauce", "Din pâine de secară, cu sos de brânză"), price: 55, weightG: 200, tags: tags(tagVegetarian)},
			{id: "m-v5-03", category: beerSnacks, name: ls("Сырные палочки", "Mozzarella sticks", "Bastonașe de mozzarella"), desc: ls("Моцарелла в панировке, соус маринара", "Breaded mozzarella, marinara dip", "Mozzarella pane, sos marinara"), price: 75, weightG: 200, tags: tags(tagVegetarian)},
			{id: "m-v5-04", category: beerSnacks, name: ls("Пивная тарелка на компанию", "Beer platter to share", "Platou la bere pentru grup"), desc: ls("Крылья, колбаски, луковые кольца, гренки, соусы", "Wings, sausages, onion rings, croutons, dips", "Aripioare, cârnăciori, inele de ceapă, crutoane, sosuri"), price: 245, weightG: 900},
			{id: "m-v5-05", category: grill, name: ls("Колбаски гриль ассорти", "Grilled sausage selection", "Cârnăciori la grătar asortați"), desc: ls("С горчицей и квашеной капустой", "With mustard and sauerkraut", "Cu muștar și varză murată"), price: 135, weightG: 350},
			{id: "m-v5-06", category: grill, name: ls("Стейк из свиной шеи", "Pork neck steak", "Ceafă de porc la grătar"), desc: ls("Сочный, на углях, с соусом барбекю", "Juicy, charcoal-grilled, BBQ sauce", "Suculentă, la cărbuni, cu sos BBQ"), price: 145, weightG: 300},
			{id: "m-v5-07", category: grill, name: ls("Рибай 300 г", "Ribeye 300 g", "Ribeye 300 g"), desc: ls("Мраморная говядина, прожарка на выбор", "Marbled beef, cooked to your liking", "Vită marmorată, gătită după preferință"), price: 295, weightG: 300, tags: tags(tagPopular)},
			{id: "m-v5-08", category: grill, name: ls("Свиные рёбра BBQ", "BBQ pork ribs", "Coaste de porc BBQ"), desc: ls("Томлённые 6 часов, в глазури барбекю", "Slow-cooked for 6 hours, BBQ glaze", "Gătite lent 6 ore, glazură BBQ"), price: 165, weightG: 450},
			{id: "m-v5-09", category: burgers, name: ls("Бургер «Бирмастер»", "Beermaster burger", "Burger Beermaster"), desc: ls("Говядина, чеддер, бекон, маринованный лук", "Beef, cheddar, bacon, pickled onion", "Vită, cheddar, bacon, ceapă murată"), price: 130, weightG: 350},
			{id: "m-v5-10", category: burgers, name: ls("Острый бургер с халапеньо", "Spicy jalapeño burger", "Burger picant cu jalapeño"), desc: ls("Говядина, перец халапеньо, соус чипотле", "Beef, jalapeños, chipotle mayo", "Vită, jalapeño, maioneză chipotle"), price: 125, weightG: 340, tags: tags(tagSpicy)},
			{id: "m-v5-11", category: sides, name: ls("Картофель по-деревенски", "Potato wedges", "Cartofi țărănești"), desc: ls("С розмарином и чесноком", "With rosemary and garlic", "Cu rozmarin și usturoi"), price: 45, weightG: 200, tags: tags(tagVegetarian)},
			{id: "m-v5-12", category: sides, name: ls("Луковые кольца", "Onion rings", "Inele de ceapă"), desc: ls("В хрустящем пивном кляре", "In crispy beer batter", "În aluat crocant cu bere"), price: 45, weightG: 150, tags: tags(tagVegetarian)},
			{id: "m-v5-13", category: beer, name: ls("Безалкогольное пиво", "Alcohol-free beer", "Bere fără alcool"), desc: ls("Светлое, 0,0%", "Pale, 0.0%", "Blondă, 0,0%"), price: 40, volumeML: 500},
			{id: "m-v5-14", category: beer, name: ls("Крафтовый лагер", "Craft lager", "Lager artizanal"), desc: ls("Светлое нефильтрованное, свежее с крана", "Unfiltered pale lager, fresh from the tap", "Blondă nefiltrată, proaspătă de la robinet"), price: 45, volumeML: 500, alcohol: true, tags: tags(tagPopular)},
			{id: "m-v5-15", category: beer, name: ls("IPA", "IPA", "IPA"), desc: ls("Яркий хмель с нотами цитруса", "Bold hops with citrus notes", "Hamei intens cu note de citrice"), price: 55, volumeML: 500, alcohol: true},
			{id: "m-v5-16", category: beer, name: ls("Стаут", "Stout", "Stout"), desc: ls("Тёмное, с нотами кофе и шоколада", "Dark, with coffee and chocolate notes", "Neagră, cu note de cafea și ciocolată"), price: 55, volumeML: 500, alcohol: true},
		},

		// Restaurant Noroc — traditional Moldovan cuisine and local wines.
		"venue-6": {
			{id: "m-v6-01", category: starters, name: ls("Овечья брынза с зеленью", "Sheep brânză with herbs", "Brânză de oi cu verdeață"), desc: ls("С домашним хлебом", "With homemade bread", "Cu pâine de casă"), price: 70, weightG: 150, tags: tags(tagVegetarian)},
			{id: "m-v6-02", category: starters, name: ls("Салат из печёного перца", "Roasted pepper salad", "Salată de ardei copți"), desc: ls("С чесноком и подсолнечным маслом", "With garlic and sunflower oil", "Cu usturoi și ulei de floarea-soarelui"), price: 60, weightG: 200, tags: tags(tagVegetarian)},
			{id: "m-v6-03", category: starters, name: ls("Рэчитурэ", "Răcitură", "Răcitură"), desc: ls("Молдавский холодец с чесноком", "Moldovan pork aspic with garlic", "Piftie moldovenească cu usturoi"), price: 75, weightG: 250},
			{id: "m-v6-04", category: soups, name: ls("Зама с домашней лапшой", "Zeamă with homemade noodles", "Zeamă cu tăiței de casă"), desc: ls("Куриный суп с любистоком и борщем", "Chicken soup soured with borș, lovage", "Supă de găină acrită cu borș și leuștean"), price: 55, weightG: 350, tags: tags(tagPopular)},
			{id: "m-v6-05", category: soups, name: ls("Чорбэ из говядины", "Beef ciorbă", "Ciorbă de vită"), desc: ls("Кислый суп с овощами и зеленью", "Sour soup with vegetables and herbs", "Ciorbă acră cu legume și verdeață"), price: 65, weightG: 350},
			{id: "m-v6-06", category: mains, name: ls("Мамалыга с брынзой и шкварками", "Mămăligă with brânză and cracklings", "Mămăligă cu brânză și jumări"), desc: ls("Со сметаной, как в молдавском селе", "With sour cream, village style", "Cu smântână, ca la țară"), price: 85, weightG: 400, tags: tags(tagPopular)},
			{id: "m-v6-07", category: mains, name: ls("Сармале в виноградных листьях", "Sarmale in vine leaves", "Sarmale în foi de viță"), desc: ls("Свинина и рис, со сметаной", "Pork and rice, with sour cream", "Carne de porc și orez, cu smântână"), price: 105, weightG: 300},
			{id: "m-v6-08", category: mains, name: ls("Токитурэ с мамалыгой", "Tochitură with mămăligă", "Tochitură cu mămăligă"), desc: ls("Свинина в вине, брынза и яйцо", "Pork stewed in wine, brânză and egg", "Porc înăbușit în vin, brânză și ou"), price: 140, weightG: 450, tags: tags(tagPopular)},
			{id: "m-v6-09", category: mains, name: ls("Мититеи с горчицей", "Mititei with mustard", "Mititei cu muștar"), desc: ls("Колбаски из фарша на углях", "Charcoal-grilled skinless sausages", "Mici la grătar pe cărbuni"), price: 95, weightG: 250},
			{id: "m-v6-10", category: mains, name: ls("Фаршированный перец", "Stuffed peppers", "Ardei umpluți"), desc: ls("С мясом и рисом в томатном соусе", "With meat and rice in tomato sauce", "Cu carne și orez în sos de roșii"), price: 95, weightG: 350},
			{id: "m-v6-11", category: desserts, name: ls("Папанаши", "Papanași", "Papanași"), desc: ls("Со сметаной и вишнёвым вареньем", "With sour cream and cherry jam", "Cu smântână și dulceață de vișine"), price: 70, weightG: 200},
			{id: "m-v6-12", category: desserts, name: ls("Пирог с яблоками и корицей", "Apple and cinnamon pie", "Plăcintă cu mere și scorțișoară"), desc: ls("Тёплый, из печи", "Served warm from the oven", "Caldă, din cuptor"), price: 50, weightG: 180},
			{id: "m-v6-13", category: drinksWine, name: ls("Домашний компот", "Homemade compote", "Compot de casă"), desc: ls("Из яблок, слив и вишни", "Apples, plums and cherries", "Din mere, prune și vișine"), price: 25, volumeML: 300},
			{id: "m-v6-14", category: drinksWine, name: ls("Фетяска Албэ, бокал", "Fetească Albă, glass", "Fetească Albă, pahar"), desc: ls("Белое сухое из местного сорта", "Dry white from a native grape", "Vin alb sec din soi autohton"), price: 55, volumeML: 150, alcohol: true},
			{id: "m-v6-15", category: drinksWine, name: ls("Рарэ Нягрэ, бокал", "Rară Neagră, glass", "Rară Neagră, pahar"), desc: ls("Мягкое красное с ягодными нотами", "Soft dry red with berry notes", "Roșu sec catifelat, cu note de fructe"), price: 60, volumeML: 150, alcohol: true},
		},

		// Loft Burger Bar — craft burgers, fries and signature cocktails.
		"venue-7": {
			{id: "m-v7-01", category: starters, name: ls("Начос с сыром и халапеньо", "Nachos with cheese and jalapeños", "Nachos cu brânză și jalapeño"), desc: ls("Сырный соус, сальса, гуакамоле", "Cheese sauce, salsa, guacamole", "Sos de brânză, salsa, guacamole"), price: 75, weightG: 250, tags: tags(tagVegetarian, tagSpicy)},
			{id: "m-v7-02", category: starters, name: ls("Куриные стрипсы", "Chicken strips", "Stripsuri de pui"), desc: ls("С медово-горчичным соусом", "With honey mustard dip", "Cu sos de miere și muștar"), price: 80, weightG: 220},
			{id: "m-v7-03", category: burgers, name: ls("Классический чизбургер", "Classic cheeseburger", "Cheeseburger clasic"), desc: ls("Говядина 180 г, чеддер, огурчики, фирменный соус", "180 g beef, cheddar, pickles, house sauce", "Vită 180 g, cheddar, castraveți murați, sos de casă"), price: 105, weightG: 320, tags: tags(tagPopular)},
			{id: "m-v7-04", category: burgers, name: ls("Бургер «Лофт» с беконом", "Loft bacon burger", "Burger Loft cu bacon"), desc: ls("Двойная говядина, бекон, карамелизированный лук", "Double beef, bacon, caramelised onion", "Vită dublă, bacon, ceapă caramelizată"), price: 145, weightG: 420, tags: tags(tagPopular)},
			{id: "m-v7-05", category: burgers, name: ls("BBQ-бургер с луковыми кольцами", "BBQ onion-ring burger", "Burger BBQ cu inele de ceapă"), desc: ls("Говядина, соус барбекю, копчёный сыр", "Beef, BBQ sauce, smoked cheese", "Vită, sos BBQ, cașcaval afumat"), price: 125, weightG: 380},
			{id: "m-v7-06", category: burgers, name: ls("Острый бургер с курицей", "Spicy chicken burger", "Burger picant cu pui"), desc: ls("Хрустящая курица, шрирача, коул-слоу", "Crispy chicken, sriracha, coleslaw", "Pui crocant, sriracha, coleslaw"), price: 110, weightG: 340, tags: tags(tagSpicy)},
			{id: "m-v7-07", category: burgers, name: ls("Веджи-бургер", "Veggie burger", "Burger vegetarian"), desc: ls("Котлета из нута и овощей, авокадо", "Chickpea and vegetable patty, avocado", "Chiftea din năut și legume, avocado"), price: 100, weightG: 320, tags: tags(tagVegetarian)},
			{id: "m-v7-08", category: sides, name: ls("Картофель фри", "French fries", "Cartofi prăjiți"), desc: ls("Хрустящий, с соусом на выбор", "Crispy, with a dip of your choice", "Crocanți, cu sos la alegere"), price: 40, weightG: 150, tags: tags(tagVegetarian)},
			{id: "m-v7-09", category: sides, name: ls("Батат фри", "Sweet potato fries", "Cartofi dulci prăjiți"), desc: ls("С копчёной паприкой", "With smoked paprika", "Cu boia afumată"), price: 55, weightG: 150, tags: tags(tagVegetarian)},
			{id: "m-v7-10", category: desserts, name: ls("Брауни с мороженым", "Brownie with ice cream", "Brownie cu înghețată"), desc: ls("Тёплый шоколадный брауни", "Warm chocolate brownie", "Brownie cald de ciocolată"), price: 60, weightG: 150},
			{id: "m-v7-11", category: drinksBar, name: ls("Молочный шейк", "Milkshake", "Milkshake"), desc: ls("Ваниль, шоколад или клубника", "Vanilla, chocolate or strawberry", "Vanilie, ciocolată sau căpșuni"), price: 55, volumeML: 350},
			{id: "m-v7-12", category: drinksBar, name: ls("Домашний лимонад", "Homemade lemonade", "Limonadă de casă"), desc: ls("Лимон, лайм и мята", "Lemon, lime and mint", "Lămâie, lime și mentă"), price: 40, volumeML: 400},
			{id: "m-v7-13", category: drinksBar, name: ls("«Лофт Сауэр»", "Loft Sour", "Loft Sour"), desc: ls("Бурбон, лимон, кленовый сироп", "Bourbon, lemon, maple syrup", "Bourbon, lămâie, sirop de arțar"), price: 110, volumeML: 150, alcohol: true, tags: tags(tagPopular)},
			{id: "m-v7-14", category: drinksBar, name: ls("Мохито", "Mojito", "Mojito"), desc: ls("Белый ром, лайм, мята, содовая", "White rum, lime, mint, soda", "Rom alb, lime, mentă, sifon"), price: 95, volumeML: 300, alcohol: true},
			{id: "m-v7-15", category: drinksBar, name: ls("Разливное пиво", "Draught beer", "Bere la halbă"), desc: ls("Светлый лагер", "Pale lager", "Lager blond"), price: 40, volumeML: 500, alcohol: true},
		},

		// Oscar Lounge — European cuisine, desserts and evening cocktails.
		"venue-8": {
			{id: "m-v8-01", category: starters, name: ls("Тартар из лосося с авокадо", "Salmon tartare with avocado", "Tartar de somon cu avocado"), desc: ls("С лаймом и кунжутом", "With lime and sesame", "Cu lime și susan"), price: 165, weightG: 160, tags: tags(tagPopular)},
			{id: "m-v8-02", category: starters, name: ls("Сырная тарелка", "Cheese board", "Platou de brânzeturi"), desc: ls("Бри, горгонзола, пармезан, мёд и орехи", "Brie, gorgonzola, parmesan, honey and nuts", "Brie, gorgonzola, parmezan, miere și nuci"), price: 185, weightG: 250, tags: tags(tagVegetarian)},
			{id: "m-v8-03", category: starters, name: ls("Креветки темпура", "Tempura prawns", "Creveți tempura"), desc: ls("Со сладким соусом чили", "With sweet chilli sauce", "Cu sos dulce de chili"), price: 155, weightG: 200},
			{id: "m-v8-04", category: salads, name: ls("Тёплый салат с уткой и апельсином", "Warm duck and orange salad", "Salată caldă cu rață și portocală"), desc: ls("Микс салатов, апельсин, медовая заправка", "Mixed leaves, orange, honey dressing", "Mix de salate, portocală, dressing cu miere"), price: 145, weightG: 250},
			{id: "m-v8-05", category: salads, name: ls("Бурата с томатами", "Burrata with tomatoes", "Burrata cu roșii"), desc: ls("Томаты черри, песто, базилик", "Cherry tomatoes, pesto, basil", "Roșii cherry, pesto, busuioc"), price: 150, weightG: 250, tags: tags(tagVegetarian)},
			{id: "m-v8-06", category: mains, name: ls("Утиная грудка с вишнёвым соусом", "Duck breast with cherry sauce", "Piept de rață cu sos de vișine"), desc: ls("С пюре из батата", "With sweet potato purée", "Cu piure de cartofi dulci"), price: 245, weightG: 300},
			{id: "m-v8-07", category: mains, name: ls("Филе лосося с овощами", "Salmon fillet with vegetables", "File de somon cu legume"), desc: ls("Соус беарнез, спаржа", "Béarnaise sauce, asparagus", "Sos bearnez, sparanghel"), price: 235, weightG: 320},
			{id: "m-v8-08", category: mains, name: ls("Ризотто с белыми грибами", "Porcini risotto", "Risotto cu hribi"), desc: ls("Арборио, пармезан, трюфельное масло", "Arborio, parmesan, truffle oil", "Arborio, parmezan, ulei de trufe"), price: 165, weightG: 300, tags: tags(tagVegetarian)},
			{id: "m-v8-09", category: mains, name: ls("Говяжьи медальоны", "Beef medallions", "Medalioane de vită"), desc: ls("Пюре из сельдерея, соус из красного вина", "Celeriac purée, red wine jus", "Piure de țelină, sos de vin roșu"), price: 285, weightG: 300},
			{id: "m-v8-10", category: desserts, name: ls("Торт «Оскар»", "Oscar signature cake", "Tortul Oscar"), desc: ls("Шоколадный мусс, пралине и малина", "Chocolate mousse, praline and raspberry", "Mousse de ciocolată, praliné și zmeură"), price: 85, weightG: 150, tags: tags(tagPopular)},
			{id: "m-v8-11", category: desserts, name: ls("Крем-брюле", "Crème brûlée", "Crème brûlée"), desc: ls("С ванилью Бурбон", "With Bourbon vanilla", "Cu vanilie Bourbon"), price: 70, weightG: 140},
			{id: "m-v8-12", category: desserts, name: ls("Чизкейк с маракуйей", "Passion fruit cheesecake", "Cheesecake cu fructul pasiunii"), desc: ls("Лёгкий, с тропической кислинкой", "Light, with a tropical tang", "Ușor, cu aciditate tropicală"), price: 75, weightG: 150},
			{id: "m-v8-13", category: cocktails, name: ls("«Ягодный бриз»", "Berry Breeze", "Berry Breeze"), desc: ls("Безалкогольный: ягоды, лайм, тоник", "Alcohol-free: berries, lime, tonic", "Fără alcool: fructe de pădure, lime, tonic"), price: 70, volumeML: 300},
			{id: "m-v8-14", category: cocktails, name: ls("Эспрессо мартини", "Espresso Martini", "Espresso Martini"), desc: ls("Водка, кофейный ликёр, свежий эспрессо", "Vodka, coffee liqueur, fresh espresso", "Vodcă, lichior de cafea, espresso proaspăt"), price: 125, volumeML: 150, alcohol: true, tags: tags(tagPopular)},
			{id: "m-v8-15", category: cocktails, name: ls("Негрони", "Negroni", "Negroni"), desc: ls("Джин, кампари, красный вермут", "Gin, Campari, red vermouth", "Gin, Campari, vermut roșu"), price: 120, volumeML: 120, alcohol: true},
			{id: "m-v8-16", category: cocktails, name: ls("Просекко, бокал", "Prosecco, glass", "Prosecco, pahar"), desc: ls("Итальянское игристое", "Italian sparkling wine", "Vin spumant italian"), price: 95, volumeML: 150, alcohol: true},
		},

		// Wine House Bălți — Moldovan wines, platters and European dishes.
		"venue-9": {
			{id: "m-v9-01", category: platters, name: ls("Тарелка молдавских сыров", "Moldovan cheese platter", "Platou cu brânzeturi moldovenești"), desc: ls("С мёдом, орехами и виноградом", "With honey, walnuts and grapes", "Cu miere, nuci și struguri"), price: 195, weightG: 300, tags: tags(tagPopular, tagVegetarian)},
			{id: "m-v9-02", category: platters, name: ls("Мясное ассорти", "Charcuterie board", "Platou de mezeluri"), desc: ls("Хамон, бастурма, салями, оливки", "Jamón, basturma, salami, olives", "Jamón, pastramă, salam, măsline"), price: 225, weightG: 300},
			{id: "m-v9-03", category: platters, name: ls("Тарелка «Винный дом» на компанию", "Wine House sharing board", "Platoul Wine House pentru grup"), desc: ls("Сыры, мясо, паштет, фрукты и гриссини", "Cheeses, cured meats, pâté, fruit, grissini", "Brânzeturi, mezeluri, pateu, fructe, grissini"), price: 420, weightG: 700},
			{id: "m-v9-04", category: startSalad, name: ls("Паштет из куриной печени", "Chicken liver pâté", "Pateu din ficat de pui"), desc: ls("С бриошью и луковым конфитюром", "With brioche and onion confit", "Cu brioșă și dulceață de ceapă"), price: 110, weightG: 180},
			{id: "m-v9-05", category: startSalad, name: ls("Салат с грушей и горгонзолой", "Pear and gorgonzola salad", "Salată cu pară și gorgonzola"), desc: ls("Руккола, грецкий орех, медовая заправка", "Rocket, walnuts, honey dressing", "Rucola, nuci, dressing cu miere"), price: 125, weightG: 220, tags: tags(tagVegetarian)},
			{id: "m-v9-06", category: mains, name: ls("Каре ягнёнка", "Rack of lamb", "Cotlete de miel"), desc: ls("С розмарином и соусом из каберне", "With rosemary and Cabernet sauce", "Cu rozmarin și sos de Cabernet"), price: 345, weightG: 300, tags: tags(tagPopular)},
			{id: "m-v9-07", category: mains, name: ls("Говяжьи щёчки в красном вине", "Beef cheeks braised in red wine", "Obraji de vită înăbușiți în vin roșu"), desc: ls("Томлённые 8 часов, с пюре", "Slow-cooked for 8 hours, with mash", "Gătiți lent 8 ore, cu piure"), price: 265, weightG: 320},
			{id: "m-v9-08", category: mains, name: ls("Дорадо на гриле", "Grilled sea bream", "Doradă la grătar"), desc: ls("С лимоном и овощами гриль", "With lemon and grilled vegetables", "Cu lămâie și legume la grătar"), price: 255, weightG: 350},
			{id: "m-v9-09", category: desserts, name: ls("Груша в красном вине", "Pear poached in red wine", "Pară în vin roșu"), desc: ls("С маскарпоне и корицей", "With mascarpone and cinnamon", "Cu mascarpone și scorțișoară"), price: 80, weightG: 200},
			{id: "m-v9-10", category: wineGlass, name: ls("Purcari Freedom Blend, бокал", "Purcari Freedom Blend, glass", "Purcari Freedom Blend, pahar"), desc: ls("Красный купаж: саперави, рара нягрэ, бастардо", "Red blend: Saperavi, Rară Neagră, Bastardo", "Cupaj roșu: Saperavi, Rară Neagră, Bastardo"), price: 150, volumeML: 150, alcohol: true, tags: tags(tagPopular)},
			{id: "m-v9-11", category: wineGlass, name: ls("Castel Mimi Fetească Albă, бокал", "Castel Mimi Fetească Albă, glass", "Castel Mimi Fetească Albă, pahar"), desc: ls("Белое сухое с нотами цветов и груши", "Dry white with floral and pear notes", "Alb sec cu note florale și de pară"), price: 95, volumeML: 150, alcohol: true},
			{id: "m-v9-12", category: wineGlass, name: ls("Et Cetera Rosé, бокал", "Et Cetera Rosé, glass", "Et Cetera Rosé, pahar"), desc: ls("Свежее розовое с нотами клубники", "Fresh rosé with strawberry notes", "Vin rose proaspăt, cu note de căpșuni"), price: 90, volumeML: 150, alcohol: true},
			{id: "m-v9-13", category: wineGlass, name: ls("Asconi Fetească Neagră, бокал", "Asconi Fetească Neagră, glass", "Asconi Fetească Neagră, pahar"), desc: ls("Красное с нотами чернослива и специй", "Red with prune and spice notes", "Roșu cu note de prune uscate și condimente"), price: 95, volumeML: 150, alcohol: true},
			{id: "m-v9-14", category: wineGlass, name: ls("Cricova Brut, бокал", "Cricova Brut, glass", "Cricova Brut, pahar"), desc: ls("Игристое классическим методом", "Traditional-method sparkling wine", "Spumant obținut prin metoda clasică"), price: 85, volumeML: 150, alcohol: true},
			{id: "m-v9-15", category: wineGlass, name: ls("Дегустационный сет из 5 вин", "Tasting flight of 5 wines", "Degustare de 5 vinuri"), desc: ls("5 × 50 мл с рассказом сомелье", "5 × 50 ml with the sommelier's notes", "5 × 50 ml, cu povestea somelierului"), price: 240, volumeML: 250, alcohol: true},
		},

		// Andy's — family pizza, pasta, salads and kids menu.
		"venue-10": {
			{id: "m-v10-01", category: salads, name: ls("Цезарь с курицей", "Chicken Caesar salad", "Salată Caesar cu pui"), desc: ls("Романо, гренки, пармезан, соус цезарь", "Romaine, croutons, parmesan, Caesar dressing", "Salată romană, crutoane, parmezan, sos Caesar"), price: 85, weightG: 260, tags: tags(tagPopular)},
			{id: "m-v10-02", category: salads, name: ls("Салат с тунцом", "Tuna salad", "Salată cu ton"), desc: ls("Тунец, яйцо, овощи, оливки", "Tuna, egg, vegetables, olives", "Ton, ou, legume, măsline"), price: 80, weightG: 250},
			{id: "m-v10-03", category: pasta, name: ls("Спагетти болоньезе", "Spaghetti Bolognese", "Spaghetti Bolognese"), desc: ls("Мясной соус с томатами и пармезаном", "Meat and tomato sauce with parmesan", "Sos de carne și roșii, cu parmezan"), price: 85, weightG: 320, tags: tags(tagPopular)},
			{id: "m-v10-04", category: pasta, name: ls("Паста с курицей и грибами", "Chicken and mushroom pasta", "Paste cu pui și ciuperci"), desc: ls("В сливочном соусе", "In a creamy sauce", "În sos cremos"), price: 90, weightG: 320},
			{id: "m-v10-05", category: pizza, name: ls("Пепперони", "Pepperoni", "Pepperoni"), desc: ls("Салями пепперони, моцарелла, томатный соус", "Pepperoni, mozzarella, tomato sauce", "Salam pepperoni, mozzarella, sos de roșii"), price: 95, weightG: 500, tags: tags(tagPopular)},
			{id: "m-v10-06", category: pizza, name: ls("Маргарита", "Margherita", "Margherita"), desc: ls("Томатный соус, моцарелла, базилик", "Tomato sauce, mozzarella, basil", "Sos de roșii, mozzarella, busuioc"), price: 75, weightG: 450, tags: tags(tagVegetarian)},
			{id: "m-v10-07", category: pizza, name: ls("Пицца «Энди'с»", "Andy's pizza", "Pizza Andy's"), desc: ls("Ветчина, бекон, грибы, кукуруза, моцарелла", "Ham, bacon, mushrooms, sweetcorn, mozzarella", "Șuncă, bacon, ciuperci, porumb, mozzarella"), price: 110, weightG: 550},
			{id: "m-v10-08", category: pizza, name: ls("Вегетарианская", "Vegetarian", "Vegetariană"), desc: ls("Перец, грибы, томаты, оливки, моцарелла", "Peppers, mushrooms, tomatoes, olives, mozzarella", "Ardei, ciuperci, roșii, măsline, mozzarella"), price: 85, weightG: 500, tags: tags(tagVegetarian)},
			{id: "m-v10-09", category: kids, name: ls("Наггетсы с картофелем фри", "Chicken nuggets with fries", "Nuggets de pui cu cartofi prăjiți"), desc: ls("С кетчупом", "With ketchup", "Cu ketchup"), price: 65, weightG: 250},
			{id: "m-v10-10", category: kids, name: ls("Мини-пицца с ветчиной", "Mini ham pizza", "Mini pizza cu șuncă"), desc: ls("Ветчина, моцарелла, томатный соус", "Ham, mozzarella, tomato sauce", "Șuncă, mozzarella, sos de roșii"), price: 50, weightG: 250},
			{id: "m-v10-11", category: kids, name: ls("Паста с сыром", "Cheesy pasta", "Paste cu brânză"), desc: ls("Нежная, в сливочно-сырном соусе", "Mild, in a creamy cheese sauce", "Delicate, în sos cremos de brânză"), price: 45, weightG: 200, tags: tags(tagVegetarian)},
			{id: "m-v10-12", category: desserts, name: ls("Блинчики с шоколадом и бананом", "Pancakes with chocolate and banana", "Clătite cu ciocolată și banană"), desc: ls("Тонкие блинчики, шоколадный соус", "Thin crêpes with chocolate sauce", "Clătite subțiri cu sos de ciocolată"), price: 50, weightG: 200},
			{id: "m-v10-13", category: desserts, name: ls("Мороженое, 2 шарика", "Ice cream, two scoops", "Înghețată, două cupe"), desc: ls("Ваниль, шоколад или клубника", "Vanilla, chocolate or strawberry", "Vanilie, ciocolată sau căpșuni"), price: 35, weightG: 100},
			{id: "m-v10-14", category: drinks, name: ls("Клубничный лимонад", "Strawberry lemonade", "Limonadă cu căpșuni"), desc: ls("Домашний, с мятой", "Homemade, with mint", "De casă, cu mentă"), price: 40, volumeML: 400},
			{id: "m-v10-15", category: drinks, name: ls("Апельсиновый фреш", "Fresh orange juice", "Fresh de portocale"), desc: ls("Свежевыжатый", "Freshly squeezed", "Proaspăt stors"), price: 50, volumeML: 250},
			{id: "m-v10-16", category: drinks, name: ls("Разливное пиво", "Draught beer", "Bere la halbă"), desc: ls("Светлый лагер", "Pale lager", "Lager blond"), price: 35, volumeML: 500, alcohol: true},
		},

		// Sakura Sushi & Ramen — Japanese sushi bar, ramen and bowls.
		"venue-11": {
			{id: "m-v11-01", category: starters, name: ls("Бобы эдамамэ с морской солью", "Steamed edamame with sea salt", "Păstăi edamame cu sare de mare"), desc: ls("Тёплые зелёные соевые бобы с хлопьями чили", "Warm soybean pods with sea salt and chilli flakes", "Păstăi calde de soia cu sare de mare și fulgi chili"), price: 65, weightG: 180, tags: tags(tagVegetarian)},
			{id: "m-v11-02", category: starters, name: ls("Салат вакамэ с ореховым соусом", "Wakame seaweed salad", "Salată wakame cu sos de nuci"), desc: ls("Морские водоросли, кунжут, кунжутно-ореховый соус", "Seaweed, sesame seeds, creamy sesame dressing", "Alge marine, susan, dressing cremos de susan"), price: 75, weightG: 160, tags: tags(tagVegetarian)},
			{id: "m-v11-03", category: starters, name: ls("Креветки эби темпура", "Ebi tempura prawns", "Creveți ebi tempura"), desc: ls("Тигровые креветки в хрустящем кляре со спайси-соусом", "Crispy battered tiger prawns with spicy mayo", "Creveți tigru în aluat crocant cu sos picant"), price: 145, weightG: 200, tags: tags(tagPopular, tagSpicy)},
			{id: "m-v11-04", category: rolls, name: ls("Филадельфия с лососем", "Philadelphia salmon roll", "Roll Philadelphia cu somon"), desc: ls("Охлаждённый лосось, сливочный сыр, огурец, авокадо", "Fresh salmon, cream cheese, cucumber, avocado", "Somon proaspăt, cremă de brânză, castravete, avocado"), price: 155, weightG: 260, tags: tags(tagPopular)},
			{id: "m-v11-05", category: rolls, name: ls("Ролл Калифорния с крабом", "California crab roll", "Roll California cu crab"), desc: ls("Снежный краб, авокадо, тобико и огурец", "Snow crab, avocado, tobiko roe and cucumber", "Crab, avocado, icre tobiko și castravete"), price: 140, weightG: 240},
			{id: "m-v11-06", category: rolls, name: ls("Зелёный Дракон с угрём", "Green Dragon unagi roll", "Roll Green Dragon cu anghilă"), desc: ls("Копчёный угорь, сливочный сыр, авокадо, соус унаги", "Smoked eel, cream cheese, avocado, unagi glaze", "Anghilă afumată, cremă de brânză, avocado, sos unagi"), price: 175, weightG: 270, tags: tags(tagPopular)},
			{id: "m-v11-07", category: rolls, name: ls("Острый ролл с тунцом", "Spicy tuna roll", "Roll picant cu ton"), desc: ls("Тунец, шрирача, хрустящий огурец, кунжут", "Tuna, sriracha mayo, crisp cucumber, sesame", "Ton, maioneză sriracha, castravete crocant, susan"), price: 145, weightG: 230, tags: tags(tagSpicy)},
			{id: "m-v11-08", category: rolls, name: ls("Сет нигири с лососем и тунцом", "Salmon & tuna nigiri set", "Set nigiri cu somon și ton"), desc: ls("6 классических нигири на тёплом рисе", "Six classic hand-pressed nigiri", "Șase nigiri clasice pe orez cald"), price: 165, weightG: 220},
			{id: "m-v11-09", category: ramen, name: ls("Тонкоцу рамен со свининой", "Pork tonkotsu ramen", "Ramen tonkotsu cu porc"), desc: ls("12-часовой бульон, лапша, томлёная свинина и яйцо аджитама", "12-hour broth, noodles, chashu pork, marinated egg", "Supă fiartă 12 ore, tăiței, porc chashu, ou marinat"), price: 145, weightG: 480, tags: tags(tagPopular)},
			{id: "m-v11-10", category: ramen, name: ls("Том Ям с морепродуктами", "Seafood Tom Yum soup", "Supă Tom Yum cu fructe de mare"), desc: ls("Тигровые креветки, кальмар, кокосовое молоко, лемонграсс", "Tiger prawns, squid, coconut milk, lemongrass, chilli", "Creveți tigru, calamar, lapte de cocos, lemongrass"), price: 155, weightG: 420, tags: tags(tagSpicy)},
			{id: "m-v11-11", category: ramen, name: ls("Боул с курицей терияки", "Chicken teriyaki rice bowl", "Bowl cu pui teriyaki"), desc: ls("Рис на пару, бедро терияки, эдамамэ и маринованный имбирь", "Steamed rice, glazed chicken, edamame, pickled ginger", "Orez la abur, pui teriyaki, edamame și ghimbir"), price: 120, weightG: 360},
			{id: "m-v11-12", category: desserts, name: ls("Сет моти манго и малина", "Mango & raspberry mochi trio", "Trio mochi cu mango și zmeură"), desc: ls("Нежное рисовое тесто с фруктовым муссом", "Soft rice dough filled with chilled fruit mousse", "Aluat fin de orez cu mousse de fructe"), price: 85, weightG: 150, tags: tags(tagVegetarian)},
			{id: "m-v11-13", category: drinks, name: ls("Чай Генмайча, чайник", "Genmaicha green tea, pot", "Ceai verde Genmaicha, ceainic"), desc: ls("Зелёный японский чай с обжаренным рисом", "Japanese green tea with toasted brown rice", "Ceai verde japonez cu orez prăjit"), price: 55, volumeML: 500},
			{id: "m-v11-14", category: drinks, name: ls("Тёплое саке", "Warm junmai sake", "Sake cald junmai"), desc: ls("Классическое рисовое вино в карафе", "Classic Japanese rice wine served warm", "Vin japonez clasic din orez"), price: 95, volumeML: 150, alcohol: true},
		},

		// Porto Mare Seafood & Grill — Mediterranean seafood & open grill.
		"venue-12": {
			{id: "m-v12-01", category: starters, name: ls("Тартар из тунца с манго", "Bluefin tuna tartare with mango", "Tartar de ton cu mango"), desc: ls("Свежий тунец, манго, лайм, оливковое масло и тосты", "Fresh tuna, mango, lime, extra virgin olive oil", "Ton proaspăt, mango, lime, ulei de măsline"), price: 185, weightG: 180, tags: tags(tagPopular)},
			{id: "m-v12-02", category: starters, name: ls("Кальмары фритти с соусом тартар", "Crispy calamari fritti", "Calamari prăjiți crocanți"), desc: ls("Нежные кольца кальмара с лимоном и домашним тартаром", "Crisp squid rings with lemon and tartare dip", "Inele crocante de calamar cu lămâie și sos tartar"), price: 145, weightG: 220},
			{id: "m-v12-03", category: salads, name: ls("Тёплый салат с осьминогом и картофелем", "Warm grilled octopus salad", "Salată caldă cu caracatiță"), desc: ls("Мини-картофель, оливки каламата, черри и руккола", "Baby potatoes, Kalamata olives, cherry tomatoes, rocket", "Cartofi noi, măsline Kalamata, roșii cherry, rucola"), price: 215, weightG: 250, tags: tags(tagPopular)},
			{id: "m-v12-04", category: soups, name: ls("Средиземноморский буйабес", "Mediterranean bouillabaisse", "Bouillabaisse mediteranean"), desc: ls("Насыщенный рыбный суп с мидиями, лососем и креветками", "Rich fish stew with mussels, salmon, prawns and rouille", "Supă bogată de pește cu midii, somon și creveți"), price: 175, weightG: 380},
			{id: "m-v12-05", category: seafood, name: ls("Сибас на углях с лимоном", "Charcoal-grilled sea bass", "Lavrac la grătar cu lămâie"), desc: ls("Целый сибас (лаврак) с тимьяном и оливками", "Whole sea bass grilled with thyme, lemon and capers", "Lavrac întreg pe cărbuni cu cimbru, lămâie și capere"), price: 295, weightG: 360, tags: tags(tagPopular)},
			{id: "m-v12-06", category: seafood, name: ls("Мидии в сливочно-чесночном соусе", "Black mussels in creamy garlic sauce", "Midii în sos cremos cu usturoi"), desc: ls("Подаются с тёплым поджаренным багетом", "Served with warm grilled baguette", "Servite cu baghetă caldă la grătar"), price: 195, weightG: 450},
			{id: "m-v12-07", category: seafood, name: ls("Тигровые креветки на гриле с чили", "Grilled garlic tiger prawns", "Creveți tigru la grătar cu chili"), desc: ls("С чесночным маслом, чили и свежей петрушкой", "With garlic herb butter, chilli and lemon", "Cu unt cu usturoi, chili și lămâie"), price: 265, weightG: 280, tags: tags(tagSpicy)},
			{id: "m-v12-08", category: seafood, name: ls("Филе лосося с печёной спаржей", "Grilled salmon fillet with asparagus", "File de somon cu sparanghel"), desc: ls("Лимонный соус велюте и спаржа на гриле", "With lemon velouté sauce and charred asparagus", "Cu sos de lămâie și sparanghel la grătar"), price: 275, weightG: 320},
			{id: "m-v12-09", category: pasta, name: ls("Паста Неро с морепродуктами", "Squid-ink seafood pasta", "Paste Nero cu fructe de mare"), desc: ls("Чёрная паста с кальмаром, мидиями и креветками", "Black tagliolini with prawns, squid, cherry tomatoes", "Tagliolini negre cu creveți, calamar și midii"), price: 210, weightG: 340},
			{id: "m-v12-10", category: desserts, name: ls("Лимонный сорбет с мятой", "Amalfi lemon sorbet", "Sorbet de lămâie cu mentă"), desc: ls("Освежающий десерт без лактозы", "Refreshing dairy-free citrus sorbet", "Desert răcoritor fără lactoză"), price: 65, weightG: 150, tags: tags(tagVegetarian)},
			{id: "m-v12-11", category: wineBar, name: ls("Совиньон Блан, бокал", "Sauvignon Blanc, glass", "Sauvignon Blanc, pahar"), desc: ls("Свежее белое сухое вино с нотами лайма", "Crisp dry white wine with citrus notes", "Vin alb sec proaspăt, cu note de citrice"), price: 95, volumeML: 150, alcohol: true},
			{id: "m-v12-12", category: wineBar, name: ls("Просекко Экстра Драй, бокал", "Prosecco Extra Dry, glass", "Prosecco Extra Dry, pahar"), desc: ls("Итальянское игристое, идеальное к морепродуктам", "Italian sparkling wine chilled to perfection", "Vin spumant italian, rece"), price: 105, volumeML: 150, alcohol: true},
			{id: "m-v12-13", category: drinks, name: ls("Цитрусовый лимонад с розмарином", "Citrus & rosemary lemonade", "Limonadă cu citrice și rozmarin"), desc: ls("Грейпфрут, апельсин, лимон и ветка розмарина", "Grapefruit, orange, lemon and fresh rosemary", "Grepfrut, portocală, lămâie și rozmarin"), price: 55, volumeML: 400},
		},

		// Brioche & Matcha Bakery — artisan pastries, specialty coffee & brunch (no alcohol).
		"venue-13": {
			{id: "m-v13-01", category: patisserie, name: ls("Круассан с фисташковым кремом", "Pistachio cream croissant", "Croissant cu cremă de fistic"), desc: ls("Слоёное тесто на французском масле, дробленая фисташка", "Butter-layered pastry filled with roasted pistachio cream", "Aluat franțuzesc cu unt și cremă de fistic"), price: 58, weightG: 135, tags: tags(tagPopular, tagVegetarian)},
			{id: "m-v13-02", category: patisserie, name: ls("Миндальная бриошь с ванилью", "Almond vanilla brioche", "Brioșă cu migdale și vanilie"), desc: ls("Воздушная бриошь с заварным кремом и миндальными лепестками", "Soft brioche with vanilla custard and toasted almonds", "Brioșă pufoasă cu cremă de vanilie și fulgi de migdale"), price: 48, weightG: 130, tags: tags(tagVegetarian)},
			{id: "m-v13-03", category: patisserie, name: ls("Улитка с корицей и кардамоном", "Cinnamon & cardamom bun", "Melc cu scorțișoară și cardamom"), desc: ls("Свежая утренняя выпечка с сахарной глазурью", "Fresh morning bake with aromatic spice swirl", "Proaspăt copt dimineața, cu scorțișoară și cardamom"), price: 42, weightG: 120, tags: tags(tagVegetarian)},
			{id: "m-v13-04", category: breakfast, name: ls("Бенедикт с лососем на бриоши", "Salmon Eggs Benedict on brioche", "Ouă Benedict cu somon pe brioșă"), desc: ls("Два яйца пашот, слабосолёный лосось, голландский соус", "Two poached eggs, cured salmon, hollandaise sauce", "Două ouă poșate, somon, sos olandez"), price: 115, weightG: 260, tags: tags(tagPopular)},
			{id: "m-v13-05", category: breakfast, name: ls("Гранола с йогуртом и ягодами", "Crispy granola yogurt bowl", "Bowl cu granola, iaurt și fructe"), desc: ls("Домашняя медовая гранола, греческий йогурт, малина", "Honey toasted oats, Greek yogurt and seasonal berries", "Granola de casă cu miere, iaurt grecesc și fructe de pădure"), price: 72, weightG: 240, tags: tags(tagVegetarian)},
			{id: "m-v13-06", category: desserts, name: ls("Баскский чизкейк Сан-Себастьян", "Basque burnt cheesecake", "Cheesecake basc San Sebastián"), desc: ls("Карамелизированная корочка и нежный кремовый центр", "Caramelised top with a silky cream-cheese centre", "Crustă caramelizată și centru cremos"), price: 75, weightG: 160, tags: tags(tagPopular, tagVegetarian)},
			{id: "m-v13-07", category: desserts, name: ls("Эклер с солёной карамелью", "Salted caramel eclair", "Ecler cu caramel sărat"), desc: ls("Заварное пирожное с кремом пралине и карамелью", "Choux pastry with silky salted caramel glaze", "Aluat choux cu cremă și caramel sărat"), price: 52, weightG: 110, tags: tags(tagVegetarian)},
			{id: "m-v13-08", category: desserts, name: ls("Тарталетка с голубикой и малиной", "Berry custard tart", "Tartă cu afine și zmeură"), desc: ls("Песочное сабле, крем-дипломат и свежие ягоды", "Crisp sablé crust, vanilla diplomat cream, berries", "Blat fraged sablé, cremă de vanilie și fructe"), price: 65, weightG: 140, tags: tags(tagVegetarian)},
			{id: "m-v13-09", category: matchaBar, name: ls("Матча латте на овсяном молоке", "Oat milk matcha latte", "Matcha latte cu lapte de ovăz"), desc: ls("Японский церемониальный чай матча Удзи", "Ceremonial Uji matcha whisked with steamed oat milk", "Matcha japonez Uji cu lapte cremos de ovăz"), price: 60, volumeML: 300, tags: tags(tagPopular)},
			{id: "m-v13-10", category: matchaBar, name: ls("Айс матча с манго", "Iced mango matcha", "Matcha rece cu mango"), desc: ls("Слоёный освежающий напиток с пюре манго", "Layered iced matcha over Alphonso mango purée", "Matcha rece stratificată cu piure de mango"), price: 68, volumeML: 350},
			{id: "m-v13-11", category: matchaBar, name: ls("Эспрессо-тоник", "Espresso tonic", "Espresso tonic"), desc: ls("Спешелти эспрессо на льду с тоником и лаймом", "Double specialty espresso over chilled tonic and lime", "Espresso de specialitate peste apă tonică cu gheață"), price: 52, volumeML: 300},
			{id: "m-v13-12", category: teaLemon, name: ls("Облепиховый чай с апельсином", "Sea buckthorn & orange tea", "Ceai de cătină și portocală"), desc: ls("Натуральные ягоды облепихи, мёд и специи", "Fresh crushed sea buckthorn, honey and orange slices", "Cătină proaspătă zdrobită, miere și portocală"), price: 48, volumeML: 400},
		},

		// Casa Rustică Grill & Terrace — Moldovan grill, terrace & family banquets.
		"venue-14": {
			{id: "m-v14-01", category: starters, name: ls("Соленья из бочки", "Village barrel pickles board", "Asortiment de murături de casă"), desc: ls("Бочковые томаты, огурцы, квашеная капуста и черемша", "Pickled tomatoes, cucumbers, cabbage and garlic", "Roșii murate, castraveți, varză și usturoi murat"), price: 65, weightG: 260, tags: tags(tagVegetarian)},
			{id: "m-v14-02", category: starters, name: ls("Запечённые перцы с брынзой и чесноком", "Roasted peppers with brânză", "Ardei copți cu brânză de oi"), desc: ls("На мангале, с овечьей брынзой и зеленью", "Chargrilled peppers with aged sheep cheese and herbs", "Ardei la grătar cu brânză de oi și verdeață"), price: 78, weightG: 230, tags: tags(tagVegetarian)},
			{id: "m-v14-03", category: soups, name: ls("Чорбэ с телятиной и квасом", "Veal ciorbă with homemade borș", "Ciorbă de vițel cu borș de casă"), desc: ls("Наваристый кислый суп в горшочке с острым перцем", "Traditional sour veal soup with hot chilli on the side", "Ciorbă tradițională acră cu ardei iute"), price: 75, weightG: 380, tags: tags(tagPopular)},
			{id: "m-v14-04", category: grill, name: ls("Фригэруй из баранины", "Charcoal lamb frigărui", "Frigărui de miel pe cărbuni"), desc: ls("Маринованная баранина с луком и лавашом", "Marinated lamb skewers with pickled onion and lavash", "Carne fragedă de miel la grătar cu ceapă murată"), price: 185, weightG: 320, tags: tags(tagPopular)},
			{id: "m-v14-05", category: grill, name: ls("Шея свиная на мангале", "Charcoal pork neck", "Ceafă de porc la grătar"), desc: ls("Сочное мясо с печёными овощами и муждеем", "Juicy charcoal pork neck with mujdei garlic sauce", "Ceafă suculentă pe cărbuni cu sos mujdei"), price: 155, weightG: 340},
			{id: "m-v14-06", category: grill, name: ls("Колбаски «Кырнэцеи» на гриле", "Homemade grilled cârnăciori", "Cârnăciori de casă la grătar"), desc: ls("Из рубленой свинины с чесноком и тимьяном", "Coarse-ground pork sausages with garlic and thyme", "Cârnăciori tradiționali cu usturoi și cimbru"), price: 120, weightG: 280},
			{id: "m-v14-07", category: grill, name: ls("Большой гриль-сет «Casa Rustică»", "Casa Rustică mixed grill board", "Platou grătar Casa Rustică"), desc: ls("Свиная шея, куриные бёдра, мититеи, колбаски и картофель", "Pork neck, chicken thighs, mititei, sausages and wedges", "Ceafă, pui, mititei, cârnăciori și cartofi pentru 3–4 persoane"), price: 390, weightG: 1100, tags: tags(tagPopular)},
			{id: "m-v14-08", category: mains, name: ls("Речная форель запечённая с мамалыгой", "Roasted river trout with mămăligă", "Păstrăv la cuptor cu mămăligă"), desc: ls("С лимоном, розмарином и сметаной", "Whole baked trout with lemon, rosemary and sour cream", "Păstrăv întreg la cuptor cu lămâie și smântână"), price: 175, weightG: 380},
			{id: "m-v14-09", category: sides, name: ls("Картофель на углях со шкварками", "Charcoal roasted potatoes", "Cartofi copți pe cărbuni"), desc: ls("С укропом и хрустящим лучком", "With fresh dill and crisp onion", "Cu mărar proaspăt și ceapă crocantă"), price: 50, weightG: 220, tags: tags(tagVegetarian)},
			{id: "m-v14-10", category: desserts, name: ls("Печёные яблоки с мёдом и орехами", "Baked apples with honey & walnuts", "Mere coapte cu miere și nuci"), desc: ls("Тёплый домашний десерт с корицей", "Warm village dessert stuffed with spiced walnuts", "Desert cald de casă cu nuci, scorțișoară și miere"), price: 55, weightG: 210, tags: tags(tagVegetarian)},
			{id: "m-v14-11", category: drinksWine, name: ls("Кувшин хлебного кваса", "Homemade bread kvass jug", "Carafă de cvas de casă"), desc: ls("Освежающий, охлаждённый в погребе", "Chilled homemade fermented rye kvass", "Cvas răcoritor de secară, ca la bunici"), price: 45, volumeML: 500},
			{id: "m-v14-12", category: drinksWine, name: ls("Каберне Совиньон, бокал", "Cabernet Sauvignon, glass", "Cabernet Sauvignon, pahar"), desc: ls("Насыщенное красное сухое к мясу на гриле", "Full-bodied Moldovan red paired with charcoal grill", "Vin roșu sec corpolent, perfect la carne pe grătar"), price: 65, volumeML: 150, alcohol: true},
		},
	}

	order := []string{"venue-1", "venue-2", "venue-3", "venue-4", "venue-5", "venue-6", "venue-7", "venue-8", "venue-9", "venue-10", "venue-11", "venue-12", "venue-13", "venue-14"}
	out := make([]models.MenuItem, 0, 160)
	for _, venueID := range order {
		for i, d := range menus[venueID] {
			ingredients, allergens := demoDishDetails(d)
			out = append(out, models.MenuItem{
				ID:              d.id,
				VenueID:         venueID,
				Category:        d.category,
				Name:            d.name,
				Description:     d.desc,
				Ingredients:     ingredients,
				Allergens:       allergens,
				Price:           d.price,
				WeightG:         d.weightG,
				VolumeML:        d.volumeML,
				ImageURL:        demoDishImage(d),
				ContainsAlcohol: d.alcohol,
				RequiresAge18:   d.alcohol,
				Tags:            d.tags,
				Position:        i + 1,
			})
		}
	}
	return out
}
