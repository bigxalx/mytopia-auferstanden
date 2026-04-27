import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export type OnboardingStepItem = {
  icon: keyof typeof MaterialIcons.glyphMap;
  text: string;
};

export type OnboardingStepDefinition = {
  buttonLabel: string;
  items: OnboardingStepItem[];
  subtitle: string;
  title: string;
};

export const FIRST_RUN_ONBOARDING_TOTAL_STEPS = 4;

export const FIRST_RUN_ONBOARDING_STEPS = {
  intro: {
    buttonLabel: 'Weiter',
    items: [
      { icon: 'theater-comedy', text: '√My Messenger verbindet Theater, Geschichte und digitales Spiel in einer gemeinsamen App.' },
      { icon: 'forum', text: 'Du erhältst Nachrichten aus den Kanälen und begleitest die Handlung direkt auf deinem Handy.' },
      { icon: 'explore', text: 'Missionen führen dich Schritt für Schritt durch das Erlebnis in der Stadt.' },
    ],
    subtitle: 'Ein kurzer Überblick, bevor du loslegst.',
    title: 'Willkommen bei √My Messenger',
  },
  location: {
    buttonLabel: 'Weiter',
    items: [
      { icon: 'place', text: 'Einige Missionen beziehen Orte in der Stadt mit ein und zeigen dir den Weg dorthin.' },
      { icon: 'map', text: 'Mit Standortzugriff siehst du Karte, Entfernung und Eincheckzonen direkt in der App.' },
      { icon: 'gps-fixed', text: 'Im nächsten Schritt fragen wir nach dem Standortzugriff. Du kannst das später jederzeit ändern.' },
    ],
    subtitle: 'Standortzugriff wird nur für GPS-Missionen und die Kartenansicht genutzt.',
    title: 'GPS-Missionen',
  },
  notifications: {
    buttonLabel: 'Weiter',
    items: [
      { icon: 'chat-bubble-outline', text: 'Nachrichten aus den Kanälen treiben die Geschichte voran und geben dir Hinweise.' },
      { icon: 'task-alt', text: 'Missionen erscheinen direkt im Verlauf und können sofort beantwortet oder gestartet werden.' },
      { icon: 'notifications-active', text: 'Aktiviere Mitteilungen, damit du neue Nachrichten und Missionen nicht verpasst.' },
    ],
    subtitle: 'Im nächsten Schritt fragen wir nach der Erlaubnis für Mitteilungen.',
    title: 'Missionen und Nachrichten',
  },
  ready: {
    buttonLabel: "Los geht's",
    items: [
      { icon: 'login', text: 'Du kannst dich jetzt anmelden oder ein neues Konto erstellen.' },
      { icon: 'settings', text: 'Mitteilungen, Diagnose und Datenschutz findest du später jederzeit in den Einstellungen.' },
    ],
    subtitle: 'Alles Weitere kannst du später in Ruhe anpassen.',
    title: 'Bereit?',
  },
} satisfies Record<string, OnboardingStepDefinition>;
