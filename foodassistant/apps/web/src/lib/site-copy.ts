import type { Locale } from "@/components/locale-provider";

const copy = {
  ru: {
    header: { map: "Карта", how: "Как работает", business: "Для ресторанов", demo: "Демо", login: "Войти", connect: "Подключить ресторан", nav: "Основная навигация", language: "Язык" },
    panel: { site: "На сайт", logout: "Выйти" },
    home: {
      live: "Уже работает в Бельцах", kicker: "Новый стандарт гостеприимства", title: "Ваш ресторан", titleAccent: "всегда рядом.",
      lead: "Гости находят ресторан на карте, выбирают стол, бронируют и делают заказ. Вы управляете залом, меню и сервисом в одном пространстве.",
      find: "Найти ресторан", connect: "Подключить заведение", pilot: "заведения в пилоте", rating: "средний рейтинг", booking247: "онлайн-бронирование",
      confirmed: "Бронь подтверждена", freeTables: "12 столов свободно", updated: "данные обновлены сейчас",
      mapEyebrow: "Живая карта города", mapTitle: "Все лучшие места —\nна одной карте", mapBody: "Каждый ресторан после регистрации и модерации автоматически появляется на карте. Гости сразу видят рейтинг, средний чек и доступные столы.",
      serviceEyebrow: "От первого касания до возвращения", serviceTitle: "Сервис, который чувствуется", serviceBody: "Мы убрали лишние действия между желанием поужинать и идеальным столиком.",
      features: [
        ["Найти место", "Карта ресторанов, фильтры по кухне, рейтингу и свободным столам."],
        ["Выбрать стол", "Живой план зала показывает свободные столы и помогает выбрать лучший."],
        ["Заказать по QR", "Меню, заказ и вызов официанта открываются прямо за вашим столом."],
        ["Вернуться снова", "История заказов, любимые места и персональные предложения."],
      ],
      ownerEyebrow: "Для владельцев ресторанов", ownerTitle: "Больше гостей.\nМеньше пустых столов.", ownerBody: "Создайте профиль заведения, добавьте фотографии и появитесь на карте после быстрой модерации.", ownerAction: "Зарегистрировать ресторан",
      repeat: "повторных визитов", missed: "пропущенных броней", oneCabinet: "1 кабинет", oneCabinetBody: "для зала и сервиса",
      slogan: "Гостеприимство начинается до входа в ресторан.", restaurants: "Ресторанам",
    },
    business: {
      eyebrow: "FoodAssistant для бизнеса", title: "Ваш зал работает.", accent: "Даже когда вы не в зале.", body: "Единый кабинет для публикации ресторана, броней, загрузки зала и цифрового сервиса. Больше видимости для гостей — больше контроля для команды.", connect: "Подключить ресторан", cabinet: "Войти в кабинет",
      proofs: ["Без установки оборудования", "Запуск за 1 рабочий день", "Поддержка RU · RO · EN"],
      benefitsEyebrow: "Всё необходимое для роста", benefitsTitle: "Технологии остаются в фоне.\nГостеприимство — на первом месте.",
      benefits: [["Ваш ресторан на карте", "После модерации профиль появляется у гостей с адресом, кухней, рейтингом и свободными столами."], ["Контроль загрузки", "Понятный план зала и статусы столов помогают команде быстрее принимать решения."], ["Цифровой сервис", "QR-меню, заказ и вызов официанта сокращают ожидание, не заменяя человеческий контакт."], ["Возвращаемость гостей", "История визитов и персональные сценарии помогают строить долгие отношения."]],
      mapEyebrow: "Видимость с первого дня", mapTitle: "Зарегистрировались —\nпоявились на карте", mapBody: "Вы заполняете профиль и отправляете его на модерацию. После публикации точка ресторана автоматически становится доступна гостям на сайте и в мобильном приложении.",
      finalEyebrow: "Начните с первого заведения", finalTitle: "Покажите гостям,\nчто вы уже рядом.", finalBody: "Создание профиля бесплатно для пилотных ресторанов Бельц.", finalAction: "Создать профиль ресторана",
    },
    register: {
      kicker: "FoodAssistant для бизнеса", title: "Ваш ресторан — на карте города и в телефоне гостя.", body: "От первой заявки до бронирований — один понятный кабинет владельца. Регистрация для гостей доступна в мобильном приложении.",
      steps: ["Создайте защищённый аккаунт владельца", "Заполните профиль и поставьте точку на карте", "Отправьте заведение на проверку платформы", "После публикации принимайте брони в кабинете"],
      review: "Проверка 1–3 рабочих дня", history: "История действий сохраняется автоматически", account: "Аккаунт владельца", connect: "Подключить ресторан", intro: "Сначала создаём личный доступ. Данные ресторана вы заполните следующим шагом в кабинете.",
      first: "Имя", last: "Фамилия", email: "Рабочий email", password: "Пароль", passwordHint: "Не менее 6 символов", legal: "Создавая аккаунт, вы подтверждаете, что имеете право представлять заведение и предоставлять данные для публикации.", creating: "Создаём кабинет…", continue: "Продолжить в кабинет", exists: "Уже есть аккаунт?", login: "Войти", taken: "Этот email уже зарегистрирован", failed: "Не удалось создать аккаунт. Попробуйте ещё раз.",
    },
    login: { title: "Войти", body: "Кабинет ресторана или панель модерации.", password: "Пароль", busy: "Вход…", action: "Войти", invalid: "Неверный email или пароль", failed: "Ошибка входа", demo: "Админ (демо):", noAccount: "Нет аккаунта?", register: "Регистрация" },
  },
  en: {
    header: { map: "Map", how: "How it works", business: "For restaurants", demo: "Demo", login: "Sign in", connect: "Connect restaurant", nav: "Main navigation", language: "Language" },
    panel: { site: "Go to website", logout: "Log out" },
    home: {
      live: "Now live in Bălți", kicker: "A new standard of hospitality", title: "Your restaurant", titleAccent: "always close.",
      lead: "Guests find a restaurant on the map, choose a table, book and order. You manage the floor, menu and service in one place.",
      find: "Find a restaurant", connect: "Connect your venue", pilot: "pilot venues", rating: "average rating", booking247: "online booking",
      confirmed: "Booking confirmed", freeTables: "12 tables available", updated: "updated just now",
      mapEyebrow: "Live city map", mapTitle: "All the best places —\non one map", mapBody: "After registration and moderation, every restaurant appears on the map automatically. Guests immediately see ratings, average spend and available tables.",
      serviceEyebrow: "From discovery to the next visit", serviceTitle: "Service you can feel", serviceBody: "We removed the friction between wanting dinner and finding the perfect table.",
      features: [["Find a place", "Restaurant map with filters for cuisine, rating and available tables."], ["Choose a table", "A live floor plan shows available tables and helps guests pick the best one."], ["Order by QR", "Menu, ordering and waiter calls open right at the table."], ["Come back", "Order history, favourite places and personalised offers."]],
      ownerEyebrow: "For restaurant owners", ownerTitle: "More guests.\nFewer empty tables.", ownerBody: "Create your venue profile, add photos and appear on the map after a quick review.", ownerAction: "Register a restaurant",
      repeat: "repeat visits", missed: "missed bookings", oneCabinet: "1 workspace", oneCabinetBody: "for floor and service",
      slogan: "Hospitality starts before guests enter.", restaurants: "Restaurants",
    },
    business: {
      eyebrow: "FoodAssistant for business", title: "Your floor keeps working.", accent: "Even when you are away.", body: "One workspace for publishing, bookings, floor load and digital service. More visibility for guests and more control for your team.", connect: "Connect restaurant", cabinet: "Open workspace",
      proofs: ["No equipment installation", "Launch in one business day", "RU · RO · EN support"],
      benefitsEyebrow: "Everything you need to grow", benefitsTitle: "Technology stays in the background.\nHospitality comes first.",
      benefits: [["Your restaurant on the map", "After moderation, guests see your address, cuisine, rating and free tables."], ["Occupancy control", "A clear floor plan and table statuses help the team make faster decisions."], ["Digital service", "QR menus, ordering and waiter calls reduce waiting without replacing human contact."], ["Guest retention", "Visit history and personalised scenarios help build long-term relationships."]],
      mapEyebrow: "Visible from day one", mapTitle: "Register —\nappear on the map", mapBody: "Complete the profile and submit it for moderation. Once published, your restaurant becomes available on the website and in the mobile app.",
      finalEyebrow: "Start with your first venue", finalTitle: "Show guests\nyou are already nearby.", finalBody: "Profile creation is free for Bălți pilot restaurants.", finalAction: "Create restaurant profile",
    },
    register: {
      kicker: "FoodAssistant for business", title: "Your restaurant on the city map and in every guest’s phone.", body: "One clear owner workspace from the first application to daily bookings. Guest registration is available in the mobile app.",
      steps: ["Create a secure owner account", "Complete the profile and set the map point", "Submit the venue for platform review", "Accept bookings after publication"],
      review: "Review in 1–3 business days", history: "Activity history is saved automatically", account: "Owner account", connect: "Connect restaurant", intro: "First, create your personal access. You will enter restaurant details in the next workspace step.",
      first: "First name", last: "Last name", email: "Work email", password: "Password", passwordHint: "At least 6 characters", legal: "By creating an account, you confirm that you may represent the venue and provide data for publication.", creating: "Creating workspace…", continue: "Continue to workspace", exists: "Already have an account?", login: "Sign in", taken: "This email is already registered", failed: "Could not create the account. Please try again.",
    },
    login: { title: "Sign in", body: "Restaurant workspace or moderation panel.", password: "Password", busy: "Signing in…", action: "Sign in", invalid: "Incorrect email or password", failed: "Sign-in failed", demo: "Admin (demo):", noAccount: "No account?", register: "Register" },
  },
  ro: {
    header: { map: "Hartă", how: "Cum funcționează", business: "Pentru restaurante", demo: "Demo", login: "Autentificare", connect: "Conectează restaurant", nav: "Navigare principală", language: "Limbă" },
    panel: { site: "La site", logout: "Ieșire" },
    home: {
      live: "Disponibil deja în Bălți", kicker: "Un nou standard al ospitalității", title: "Restaurantul tău", titleAccent: "mereu aproape.",
      lead: "Oaspeții găsesc restaurantul pe hartă, aleg masa, rezervă și comandă. Tu gestionezi sala, meniul și serviciul într-un singur loc.",
      find: "Găsește restaurant", connect: "Conectează localul", pilot: "localuri pilot", rating: "rating mediu", booking247: "rezervări online",
      confirmed: "Rezervare confirmată", freeTables: "12 mese libere", updated: "actualizat acum",
      mapEyebrow: "Harta live a orașului", mapTitle: "Cele mai bune localuri —\npe aceeași hartă", mapBody: "După înregistrare și moderare, fiecare restaurant apare automat pe hartă. Oaspeții văd ratingul, bonul mediu și mesele disponibile.",
      serviceEyebrow: "De la descoperire la următoarea vizită", serviceTitle: "Serviciu care se simte", serviceBody: "Am eliminat pașii inutili dintre dorința de a lua cina și masa perfectă.",
      features: [["Găsește un loc", "Hartă cu filtre după bucătărie, rating și mese disponibile."], ["Alege masa", "Planul live al sălii arată mesele libere și ajută la alegere."], ["Comandă prin QR", "Meniul, comanda și chemarea chelnerului se deschid la masă."], ["Revino", "Istoricul comenzilor, locurile favorite și ofertele personale."]],
      ownerEyebrow: "Pentru proprietarii de restaurante", ownerTitle: "Mai mulți oaspeți.\nMai puține mese goale.", ownerBody: "Creează profilul localului, adaugă fotografii și apari pe hartă după verificare.", ownerAction: "Înregistrează restaurant",
      repeat: "vizite repetate", missed: "rezervări ratate", oneCabinet: "1 cabinet", oneCabinetBody: "pentru sală și serviciu",
      slogan: "Ospitalitatea începe înainte de intrare.", restaurants: "Restaurante",
    },
    business: {
      eyebrow: "FoodAssistant pentru afaceri", title: "Sala ta continuă să lucreze.", accent: "Chiar și când nu ești acolo.", body: "Un singur cabinet pentru publicare, rezervări, încărcarea sălii și serviciu digital. Mai multă vizibilitate pentru oaspeți și control pentru echipă.", connect: "Conectează restaurant", cabinet: "Intră în cabinet",
      proofs: ["Fără instalare de echipament", "Lansare într-o zi lucrătoare", "Suport RU · RO · EN"],
      benefitsEyebrow: "Tot ce trebuie pentru creștere", benefitsTitle: "Tehnologia rămâne în fundal.\nOspitalitatea este pe primul loc.",
      benefits: [["Restaurantul tău pe hartă", "După moderare, profilul apare cu adresă, bucătărie, rating și mese libere."], ["Controlul ocupării", "Planul clar al sălii și statutul meselor ajută echipa să decidă rapid."], ["Serviciu digital", "Meniul QR, comenzile și chemarea chelnerului reduc așteptarea fără a înlocui contactul uman."], ["Revenirea oaspeților", "Istoricul vizitelor și scenariile personale construiesc relații pe termen lung."]],
      mapEyebrow: "Vizibilitate din prima zi", mapTitle: "Te înregistrezi —\napari pe hartă", mapBody: "Completezi profilul și îl trimiți la moderare. După publicare, restaurantul este disponibil pe site și în aplicația mobilă.",
      finalEyebrow: "Începe cu primul local", finalTitle: "Arată oaspeților\ncă ești deja aproape.", finalBody: "Crearea profilului este gratuită pentru restaurantele pilot din Bălți.", finalAction: "Creează profilul restaurantului",
    },
    register: {
      kicker: "FoodAssistant pentru afaceri", title: "Restaurantul tău pe harta orașului și în telefonul oaspetelui.", body: "Un cabinet clar de la prima cerere până la rezervări. Înregistrarea oaspeților este disponibilă în aplicația mobilă.",
      steps: ["Creează un cont securizat de proprietar", "Completează profilul și pune punctul pe hartă", "Trimite localul la verificarea platformei", "Primește rezervări după publicare"],
      review: "Verificare în 1–3 zile lucrătoare", history: "Istoricul acțiunilor se salvează automat", account: "Cont de proprietar", connect: "Conectează restaurant", intro: "Mai întâi creăm accesul personal. Datele restaurantului se completează la pasul următor în cabinet.",
      first: "Prenume", last: "Nume", email: "Email de serviciu", password: "Parolă", passwordHint: "Cel puțin 6 caractere", legal: "Prin crearea contului confirmi că ai dreptul să reprezinți localul și să furnizezi date pentru publicare.", creating: "Creăm cabinetul…", continue: "Continuă în cabinet", exists: "Ai deja cont?", login: "Autentificare", taken: "Acest email este deja înregistrat", failed: "Contul nu a putut fi creat. Încearcă din nou.",
    },
    login: { title: "Autentificare", body: "Cabinetul restaurantului sau panoul de moderare.", password: "Parolă", busy: "Autentificare…", action: "Autentificare", invalid: "Email sau parolă incorectă", failed: "Autentificarea a eșuat", demo: "Admin (demo):", noAccount: "Nu ai cont?", register: "Înregistrare" },
  },
} as const;

export function getSiteCopy(locale: Locale) {
  return copy[locale];
}
