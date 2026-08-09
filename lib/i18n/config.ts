export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" }
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];
export const DEFAULT_LANGUAGE: LanguageCode = "en";
export const LANGUAGE_STORAGE_KEY = "challenge_suite_language";

type Phrase = readonly [english: string, french: string, spanish: string, portuguese: string];
const phrases: Phrase[] = [
  ["Language", "Langue", "Idioma", "Idioma"], ["Sign in", "Se connecter", "Iniciar sesión", "Entrar"], ["Sign up", "S'inscrire", "Registrarse", "Criar conta"],
  ["Create Account", "Créer un compte", "Crear una cuenta", "Criar uma conta"], ["Settings", "Paramètres", "Configuración", "Configurações"], ["Search", "Rechercher", "Buscar", "Pesquisar"],
  ["Explore", "Explorer", "Explorar", "Explorar"], ["Saved", "Enregistrés", "Guardados", "Guardados"], ["Pricing", "Tarifs", "Precios", "Preços"], ["About", "À propos", "Acerca de", "Sobre"],
  ["Create Challenge", "Créer un défi", "Crear desafío", "Criar desafio"], ["Manage Challenges", "Gérer les défis", "Gestionar desafíos", "Gerir desafios"], ["View challenge", "Voir le défi", "Ver desafío", "Ver desafio"],
  ["Creator Studio", "Studio créateur", "Estudio de creador", "Estúdio do criador"], ["Creator Analytics", "Analyses créateur", "Analíticas del creador", "Análises do criador"], ["Monthly Boosts", "Boosts mensuels", "Impulsos mensuales", "Impulsos mensais"],
  ["Sponsor-Ready Challenges", "Défis prêts pour sponsors", "Desafíos listos para patrocinadores", "Desafios prontos para patrocinadores"], ["Creator Submissions", "Soumissions créateur", "Entregas del creador", "Envios do criador"],
  ["Participants", "Participants", "Participantes", "Participantes"], ["Submissions", "Soumissions", "Entregas", "Envios"], ["Recorded Votes", "Votes enregistrés", "Votos registrados", "Votos registados"], ["Sponsor Interest", "Intérêt des sponsors", "Interés de patrocinadores", "Interesse de patrocinadores"],
  ["Date range", "Période", "Rango de fechas", "Intervalo de datas"], ["All challenges", "Tous les défis", "Todos los desafíos", "Todos os desafios"], ["All statuses", "Tous les statuts", "Todos los estados", "Todos os estados"],
  ["Challenge Activity Trend", "Tendance d'activité des défis", "Tendencia de actividad", "Tendência de atividade"], ["Challenge Performance", "Performance des défis", "Rendimiento de desafíos", "Desempenho dos desafios"],
  ["Recent Activity", "Activité récente", "Actividad reciente", "Atividade recente"], ["Pending Reviews", "Avis en attente", "Revisiones pendientes", "Revisões pendentes"], ["Top Challenges", "Meilleurs défis", "Principales desafíos", "Principais desafios"],
  ["Profile", "Profil", "Perfil", "Perfil"], ["Overview", "Aperçu", "Resumen", "Visão geral"], ["Challenges", "Défis", "Desafíos", "Desafios"], ["Entries", "Participations", "Entradas", "Participações"], ["Wins", "Victoires", "Victorias", "Vitórias"], ["Achievements", "Réalisations", "Logros", "Conquistas"], ["Activity", "Activité", "Actividad", "Atividade"],
  ["Edit Profile", "Modifier le profil", "Editar perfil", "Editar perfil"], ["Share Profile", "Partager le profil", "Compartir perfil", "Partilhar perfil"], ["View Public Profile", "Voir le profil public", "Ver perfil público", "Ver perfil público"],
  ["Wallet", "Portefeuille", "Billetera", "Carteira"], ["Wallet & Revenue", "Portefeuille et revenus", "Billetera e ingresos", "Carteira e receitas"], ["DoroCoins", "DoroCoins", "DoroCoins", "DoroCoins"], ["Challenge Credits", "Crédits Challenge", "Créditos Challenge", "Créditos Challenge"],
  ["Available balance", "Solde disponible", "Saldo disponible", "Saldo disponível"], ["Transactions", "Transactions", "Transacciones", "Transações"], ["Rewards", "Récompenses", "Recompensas", "Recompensas"],
  ["Become a sponsor", "Devenir sponsor", "Convertirse en patrocinador", "Tornar-se patrocinador"], ["Sponsor benefits", "Avantages sponsor", "Beneficios del patrocinador", "Benefícios do patrocinador"], ["Start Sponsor Profile", "Créer le profil sponsor", "Iniciar perfil de patrocinador", "Iniciar perfil de patrocinador"],
  ["Continue", "Continuer", "Continuar", "Continuar"], ["Back", "Retour", "Atrás", "Voltar"], ["Save", "Enregistrer", "Guardar", "Guardar"], ["Save & Finish Later", "Enregistrer et finir plus tard", "Guardar y terminar después", "Guardar e terminar depois"],
  ["Loading...", "Chargement...", "Cargando...", "A carregar..."], ["No results yet", "Aucun résultat", "Aún no hay resultados", "Ainda sem resultados"], ["Try again", "Réessayer", "Intentar de nuevo", "Tentar novamente"],
  ["For talent", "Pour les talents", "Para talentos", "Para talentos"], ["Join as talent", "Rejoindre comme talent", "Unirse como talento", "Participar como talento"], ["Talent questions", "Questions des talents", "Preguntas de talentos", "Perguntas de talentos"],
  ["How competing works", "Comment participer", "Cómo competir", "Como competir"], ["Discover", "Découvrir", "Descubrir", "Descobrir"], ["Join and submit", "Rejoindre et soumettre", "Unirse y enviar", "Participar e enviar"],
  ["Contact Support", "Contacter le support", "Contactar soporte", "Contactar suporte"], ["Community Guidelines", "Règles de la communauté", "Normas de la comunidad", "Diretrizes da comunidade"], ["Privacy", "Confidentialité", "Privacidad", "Privacidade"], ["Terms", "Conditions", "Términos", "Termos"],
  ["Log Out", "Se déconnecter", "Cerrar sesión", "Terminar sessão"], ["View Profile", "Voir le profil", "Ver perfil", "Ver perfil"], ["Account Settings", "Paramètres du compte", "Configuración de cuenta", "Configurações da conta"], ["Help Center", "Centre d'aide", "Centro de ayuda", "Central de ajuda"]
];

export const UI_TRANSLATIONS = Object.fromEntries(phrases.map(([en, fr, es, pt]) => [en, { en, fr, es, pt }])) as Record<string, Record<LanguageCode, string>>;
export type TranslationKey = keyof typeof UI_TRANSLATIONS;

export function normalizeLanguage(value: unknown): LanguageCode {
  return SUPPORTED_LANGUAGES.some((language) => language.code === value) ? value as LanguageCode : DEFAULT_LANGUAGE;
}

export function translate(language: LanguageCode, key: string) {
  return UI_TRANSLATIONS[key]?.[language] ?? UI_TRANSLATIONS[key]?.en ?? key;
}

export function translateFirstPartyText(language: LanguageCode, value: string) {
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const core = value.trim();
  return core ? `${leading}${translate(language, core)}${trailing}` : value;
}
