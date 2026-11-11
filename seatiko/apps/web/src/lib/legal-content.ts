import type { Locale } from "@/components/locale-provider";

export type LegalDocId = "terms" | "privacy" | "data" | "cookies" | "contacts";

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export interface LegalDoc {
  id: LegalDocId;
  title: string;
  badge: string;
  updatedAt: string;
  sections: LegalSection[];
}

export const LEGAL_DOCS: Record<Locale, Record<LegalDocId, LegalDoc>> = {
  ru: {
    terms: {
      id: "terms",
      title: "Пользовательское соглашение и условия сервиса",
      badge: "Официальный регламент",
      updatedAt: "Действует с 1 января 2026 г.",
      sections: [
        {
          title: "1. Предмет соглашения",
          paragraphs: [
            "Сервис Seatiko (далее — «Платформа») предоставляет пользователям бесплатный доступ к поиску заведений общественного питания, просмотру схемы залов и столов, а также возможность онлайн-бронирования столиков в заведениях муниципия Бельцы.",
            "Использование любых функций платформы означает полное и безоговорочное согласие пользователя с настоящими Условиями.",
          ],
        },
        {
          title: "2. Правила бронирования и посадки",
          paragraphs: [
            "Бронирование столов через Seatiko осуществляется бесплатно для гостей.",
            "Ресторан-партнер обязуется удерживать забронированный стол в течение 15 минут от указанного гостем времени прибытия. По истечении 15 минут при отсутствии связи с гостем ресторан вправе предоставить стол гостям в порядке живой очереди.",
          ],
        },
        {
          title: "3. Отмена и изменение брони",
          paragraphs: [
            "В случае изменения планов пользователь обязуется заблаговременно отменить бронь через личный кабинет либо по ссылке в уведомлении.",
            "Систематические пропуски бронирований без отмены («no-show») могут приводить к ограничению количества активных броней в учетной записи.",
          ],
        },
        {
          title: "4. Информация о блюдах и ценах",
          paragraphs: [
            "Меню, состав блюд, цены и рабочий график заведений предоставляются непосредственно администрацией ресторанов. Seatiko принимает все меры для поддержания актуальности данных в режиме реального времени.",
          ],
        },
      ],
    },
    privacy: {
      id: "privacy",
      title: "Политика конфиденциальности",
      badge: "Закон РМ № 133 / GDPR",
      updatedAt: "Редакция 2026 г.",
      sections: [
        {
          title: "1. Соответствие законодательству",
          paragraphs: [
            "Платформа Seatiko обрабатывает персональные данные в строгом соответствии с Законом Республики Молдова № 133 от 08.07.2011 «О защите персональных данных» и европейскими принципами регламента GDPR.",
          ],
        },
        {
          title: "2. Собираемая информация",
          paragraphs: [
            "Для оформления бронирования мы запрашиваем только минимально необходимые данные: имя гостя, контактный телефон и адрес электронной почты (для отправки подтверждения брони и кодов доступа к столу).",
          ],
        },
        {
          title: "3. Передача данных ресторанам",
          paragraphs: [
            "Данные гостя передаются исключительно выбранному ресторану для идентификации брони и качественной встречи в зале. Мы категорически не продаем и не передаем ваши данные рекламным сетям или третьим сторонам.",
          ],
        },
        {
          title: "4. Безопасность и право на удаление",
          paragraphs: [
            "Все сетевые соединения защищены протоколами сквозного шифрования TLS/SSL. Вы вправе в любой момент запросить выгрузку или полное удаление своих данных, обратившись по адресу privacy@seatiko.md.",
          ],
        },
      ],
    },
    data: {
      id: "data",
      title: "Защита и обработка персональных данных",
      badge: "Закон № 133",
      updatedAt: "Бельцы, 2026 г.",
      sections: [
        {
          title: "1. Правовые основания обработки",
          paragraphs: [
            "Обработка персональных данных осуществляется с явного согласия пользователя, выраженного при оформлении бронирования или регистрации профиля гостя.",
          ],
        },
        {
          title: "2. Цели и регламент хранения",
          paragraphs: [
            "Данные используются для координации визитов, учета предпочтений гостя и улучшения работы ресторанов. Данные хранятся на изолированных защищенных серверах с регулярным аудитом доступа.",
          ],
        },
        {
          title: "3. Права субъекта данных",
          paragraphs: [
            "Субъект данных имеет право на доступ к информации, ее уточнение, блокирование или уничтожение в соответствии со статьями 12–14 Закона РМ № 133.",
          ],
        },
      ],
    },
    cookies: {
      id: "cookies",
      title: "Политика использования файлов Cookie",
      badge: "Без рекламы",
      updatedAt: "Редакция 2026 г.",
      sections: [
        {
          title: "1. Назначение файлов Cookie",
          paragraphs: [
            "Файлы Cookie — это небольшие текстовые файлы, которые браузер сохраняет для корректного отображения сайта и запоминания настроек пользователя.",
          ],
        },
        {
          title: "2. Какие cookies мы применяем",
          paragraphs: [
            "Seatiko использует исключительно необходимые технические cookies: сохранение языка интерфейса (RU / EN / RO), выбранной темы оформления (светлая / темная) и защищенной сессии авторизации.",
          ],
        },
        {
          title: "3. Отсутствие сторонних трекеров",
          paragraphs: [
            "Мы не размещаем сторонние рекламные пиксели, жучки или межсайтовые трекеры отслеживания поведения.",
          ],
        },
      ],
    },
    contacts: {
      id: "contacts",
      title: "Реквизиты и контакты сервиса",
      badge: "Официально",
      updatedAt: "Бельцы, Молдова",
      sections: [
        {
          title: "1. Администрация платформы",
          paragraphs: [
            "Seatiko — цифровая платформа бронирования и ресторанного сервиса в муниципии Бельцы.",
            "Служба поддержки: support@seatiko.md",
            "Для ресторанов и партнерств: partners@seatiko.md",
          ],
        },
        {
          title: "2. График работы службы заботы",
          paragraphs: [
            "Линия заботы о гостях и партнерах доступна ежедневно с 09:00 до 22:00.",
            "Горячая линия: +373 231 00 240",
          ],
        },
        {
          title: "3. Локация проекта",
          paragraphs: [
            "Республика Молдова, мун. Бельцы (Republica Moldova, mun. Bălți).",
          ],
        },
      ],
    },
  },
  en: {
    terms: {
      id: "terms",
      title: "Terms of Service & Platform Rules",
      badge: "Official Rules",
      updatedAt: "Effective January 1, 2026",
      sections: [
        {
          title: "1. Subject of Agreement",
          paragraphs: [
            "Seatiko provides users with free access to discover restaurants, view floor plans and tables, and book tables online across the municipality of Bălți.",
            "Using any feature of the platform indicates full agreement with these Terms.",
          ],
        },
        {
          title: "2. Table Reservation Policy",
          paragraphs: [
            "Table reservations via Seatiko are free for guests.",
            "The partner venue holds the reserved table for 15 minutes past the scheduled arrival time. After 15 minutes without contact, the table may be released to walk-in guests.",
          ],
        },
        {
          title: "3. Cancellations & Modifications",
          paragraphs: [
            "If your plans change, please cancel or modify your reservation promptly through your account or via the confirmation link.",
            "Repeated no-shows without cancellation may lead to restrictions on active bookings.",
          ],
        },
        {
          title: "4. Menus & Pricing Accuracy",
          paragraphs: [
            "Menus, prices, and operating hours are maintained directly by partner venues. Seatiko strives to keep all details synchronized in real time.",
          ],
        },
      ],
    },
    privacy: {
      id: "privacy",
      title: "Privacy Policy",
      badge: "Law No. 133 / GDPR",
      updatedAt: "2026 Edition",
      sections: [
        {
          title: "1. Legal Compliance",
          paragraphs: [
            "Seatiko processes personal data in strict compliance with the Republic of Moldova Law No. 133 of 08.07.2011 on Personal Data Protection and GDPR principles.",
          ],
        },
        {
          title: "2. Information We Collect",
          paragraphs: [
            "We collect only the essential information needed to fulfill your booking: guest name, contact phone number, and email for confirmations.",
          ],
        },
        {
          title: "3. Sharing with Venues",
          paragraphs: [
            "Your details are shared solely with the chosen restaurant to identify your reservation upon arrival. We never sell or rent your personal information to third-party ad networks.",
          ],
        },
        {
          title: "4. Security & Deletion Rights",
          paragraphs: [
            "All connections are secured with TLS/SSL encryption. You may request data deletion or account removal anytime by writing to privacy@seatiko.md.",
          ],
        },
      ],
    },
    data: {
      id: "data",
      title: "Data Protection Notice",
      badge: "Law No. 133",
      updatedAt: "Bălți, 2026",
      sections: [
        {
          title: "1. Legal Grounds",
          paragraphs: [
            "Data processing is based on explicit user consent provided when creating a booking or registering an account.",
          ],
        },
        {
          title: "2. Storage & Security",
          paragraphs: [
            "Reservation records are stored in secure cloud environments with strict role-based access control and regular audits.",
          ],
        },
        {
          title: "3. User Rights",
          paragraphs: [
            "You have the right to inspect, correct, block, or delete your personal records under Moldovan data protection law.",
          ],
        },
      ],
    },
    cookies: {
      id: "cookies",
      title: "Cookie Policy",
      badge: "Zero Tracking",
      updatedAt: "2026 Edition",
      sections: [
        {
          title: "1. Purpose of Cookies",
          paragraphs: [
            "Cookies are small text files stored in your browser to remember your language and preference settings.",
          ],
        },
        {
          title: "2. What We Store",
          paragraphs: [
            "We only use essential functional cookies: your selected language (RU / EN / RO), appearance theme (light / dark), and authentication session.",
          ],
        },
        {
          title: "3. No Advertising Trackers",
          paragraphs: [
            "We do not use advertising pixels, third-party cookies, or cross-site tracking scripts.",
          ],
        },
      ],
    },
    contacts: {
      id: "contacts",
      title: "Legal Contacts & Details",
      badge: "Official",
      updatedAt: "Bălți, Moldova",
      sections: [
        {
          title: "1. Platform Administration",
          paragraphs: [
            "Seatiko — digital hospitality and table reservation system for Bălți.",
            "Guest support: support@seatiko.md",
            "Restaurant partnerships: partners@seatiko.md",
          ],
        },
        {
          title: "2. Support Hours",
          paragraphs: [
            "Our support team is available daily from 09:00 to 22:00.",
            "Helpline: +373 231 00 240",
          ],
        },
        {
          title: "3. Registered Location",
          paragraphs: [
            "Republic of Moldova, mun. Bălți.",
          ],
        },
      ],
    },
  },
  ro: {
    terms: {
      id: "terms",
      title: "Termeni și Condiții de Utilizare",
      badge: "Regulament Oficial",
      updatedAt: "În vigoare de la 1 ianuarie 2026",
      sections: [
        {
          title: "1. Obiectul Acordului",
          paragraphs: [
            "Serviciul Seatiko oferă acces gratuit la căutarea localurilor, vizualizarea planului meselor și rezervarea online în restaurantele din municipiul Bălți.",
            "Utilizarea oricărei funcționalități a platformei presupune acordul deplin cu acești Termeni.",
          ],
        },
        {
          title: "2. Reguli de Rezervare și Sosire",
          paragraphs: [
            "Rezervarea meselor prin Seatiko este gratuită pentru oaspeți.",
            "Restaurantul partener păstrează masa rezervată timp de 15 minute după ora stabilită. După 15 minute, masa poate fi oferită altor oaspeți.",
          ],
        },
        {
          title: "3. Anularea și Modificarea Rezervării",
          paragraphs: [
            "Dacă planurile dvs. se schimbă, vă rugăm să anulați rezervarea din contul personal sau prin linkul din confirmare.",
            "Neprezentările repetate fără anulare prealabilă pot atrage restricții la rezervările viitoare.",
          ],
        },
        {
          title: "4. Meniuri și Prețuri",
          paragraphs: [
            "Meniul, prețurile și programul sunt gestionate direct de restaurantele partenere. Seatiko depune toate eforturile pentru menținerea datelor actualizate.",
          ],
        },
      ],
    },
    privacy: {
      id: "privacy",
      title: "Politica de Confidențialitate",
      badge: "Legea Nr. 133 / GDPR",
      updatedAt: "Ediția 2026",
      sections: [
        {
          title: "1. Conformitate Legală",
          paragraphs: [
            "Platforma Seatiko prelucrează datele cu caracter personal în strictă conformitate cu Legea Republicii Moldova Nr. 133 din 08.07.2011 și principiile GDPR.",
          ],
        },
        {
          title: "2. Datele Colectate",
          paragraphs: [
            "Colectăm doar datele strict necesare: numele oaspetelui, numărul de telefon și adresa de email pentru confirmarea rezervărilor.",
          ],
        },
        {
          title: "3. Transmiterea Datelor către Restaurante",
          paragraphs: [
            "Datele sunt transmise exclusiv restaurantului selectat pentru identificarea rezervării la sosire. Nu vindem și nu transmitem datele rețelelor publicitare.",
          ],
        },
        {
          title: "4. Securitate și Ștergerea Datelor",
          paragraphs: [
            "Toate conexiunile sunt securizate prin criptare TLS/SSL. Puteți solicita ștergerea completă a datelor scriind la privacy@seatiko.md.",
          ],
        },
      ],
    },
    data: {
      id: "data",
      title: "Protecția Datelor cu Caracter Personal",
      badge: "Legea Nr. 133",
      updatedAt: "Bălți, 2026",
      sections: [
        {
          title: "1. Temeiuri Juridice",
          paragraphs: [
            "Prelucrarea datelor se realizează cu acordul explicit al utilizatorului la crearea unei rezervări sau cont.",
          ],
        },
        {
          title: "2. Stocare și Securitate",
          paragraphs: [
            "Datele despre rezervări sunt păstrate pe servere securizate cu acces restricționat și audit regulat.",
          ],
        },
        {
          title: "3. Drepturile Dumneavoastră",
          paragraphs: [
            "Aveți dreptul de acces, rectificare, blocare sau ștergere a datelor personale conform legislației Republicii Moldova.",
          ],
        },
      ],
    },
    cookies: {
      id: "cookies",
      title: "Politica privind Cookie-urile",
      badge: "Fără Urmărire",
      updatedAt: "Ediția 2026",
      sections: [
        {
          title: "1. Rolul Cookie-urilor",
          paragraphs: [
            "Cookie-urile sunt mici fișiere text salvate în browser pentru memorarea preferințelor utilizatorului.",
          ],
        },
        {
          title: "2. Ce Cookie-uri Folosim",
          paragraphs: [
            "Utilizăm doar cookie-uri tehnice esențiale: limba selectată (RU / EN / RO), tema vizuală (luminos / întunecat) și sesiunea de autentificare.",
          ],
        },
        {
          title: "3. Fără Trackere Publicitare",
          paragraphs: [
            "Nu folosim pixeli publicitari terți sau scripturi de urmărire între site-uri.",
          ],
        },
      ],
    },
    contacts: {
      id: "contacts",
      title: "Date Juridice și Contact",
      badge: "Oficial",
      updatedAt: "Bălți, Moldova",
      sections: [
        {
          title: "1. Administrația Platformei",
          paragraphs: [
            "Seatiko — platformă digitală de ospitalitate și rezervări în municipiul Bălți.",
            "Suport oaspeți: support@seatiko.md",
            "Parteneriate restaurante: partners@seatiko.md",
          ],
        },
        {
          title: "2. Programul Serviciului de Asistență",
          paragraphs: [
            "Echipa de suport este disponibilă zilnic între orele 09:00 și 22:00.",
            "Linie telefonică: +373 231 00 240",
          ],
        },
        {
          title: "3. Sediul Serviciului",
          paragraphs: [
            "Republica Moldova, mun. Bălți.",
          ],
        },
      ],
    },
  },
};

