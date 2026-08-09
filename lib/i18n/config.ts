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
  ["Turn your skills into opportunities worth competing for.", "Transformez vos talents en opportunites qui meritent votre engagement.", "Convierte tus habilidades en oportunidades por las que vale la pena competir.", "Transforme as suas competencias em oportunidades que valem a competicao."],
  ["Discover challenges, submit your work, build public credibility and follow results through one structured competition platform.", "Decouvrez des defis, presentez votre travail, renforcez votre credibilite publique et suivez les resultats sur une plateforme structuree.", "Descubre desafios, presenta tu trabajo, crea credibilidad publica y sigue los resultados en una plataforma estructurada.", "Descubra desafios, envie o seu trabalho, construa credibilidade publica e acompanhe resultados numa plataforma estruturada."],
  ["What you can do", "Ce que vous pouvez faire", "Lo que puedes hacer", "O que pode fazer"], ["Build a competition record around real work.", "Construisez un parcours de competition fonde sur un travail reel.", "Construye un historial competitivo basado en trabajo real.", "Construa um historico competitivo baseado em trabalho real."],
  ["Discover public challenges", "Decouvrir les defis publics", "Descubrir desafios publicos", "Descobrir desafios publicos"], ["Enter free or paid competitions", "Participer a des competitions gratuites ou payantes", "Participar en competiciones gratuitas o de pago", "Participar em competicoes gratuitas ou pagas"],
  ["Upload eligible submissions", "Importer des participations admissibles", "Subir participaciones elegibles", "Carregar participacoes elegiveis"], ["Build public credibility", "Renforcer votre credibilite publique", "Crear credibilidad publica", "Construir credibilidade publica"],
  ["Follow voting and results", "Suivre les votes et les resultats", "Seguir las votaciones y los resultados", "Acompanhar votacoes e resultados"], ["Receive approved prize credits", "Recevoir les credits de prix approuves", "Recibir creditos de premios aprobados", "Receber creditos de premios aprovados"],
  ["Community voices", "Voix de la communaute", "Voces de la comunidad", "Vozes da comunidade"], ["Follow the result", "Suivre le resultat", "Seguir el resultado", "Acompanhar o resultado"],
  ["Search public challenges by category, format, timeline and entry type.", "Recherchez les defis publics par categorie, format, calendrier et type de participation.", "Busca desafios publicos por categoria, formato, calendario y tipo de participacion.", "Pesquise desafios publicos por categoria, formato, calendario e tipo de participacao."],
  ["Follow the official registration, payment and submission steps for the challenge.", "Suivez les etapes officielles d'inscription, de paiement et de soumission du defi.", "Sigue los pasos oficiales de registro, pago y envio del desafio.", "Siga os passos oficiais de registo, pagamento e envio do desafio."],
  ["Track eligible voting, rankings and confirmed winner announcements.", "Suivez les votes admissibles, les classements et les annonces de gagnants confirmees.", "Sigue las votaciones elegibles, las clasificaciones y los anuncios de ganadores confirmados.", "Acompanhe votacoes elegiveis, classificacoes e anuncios de vencedores confirmados."],
  ["Find a challenge worth showing up for.", "Trouvez un defi qui merite votre engagement.", "Encuentra un desafio por el que valga la pena presentarse.", "Encontre um desafio que valha a sua participacao."], ["Create your talent workspace", "Creer votre espace talent", "Crear tu espacio de talento", "Criar o seu espaco de talento"],
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
  ,
  ["Sign In", "Se connecter", "Iniciar sesi?n", "Entrar"], ["Sign Up", "S'inscrire", "Registrarse", "Criar conta"], ["Create account", "Cr?er un compte", "Crear una cuenta", "Criar uma conta"],
  ["Sign in to continue", "Connectez-vous pour continuer", "Inicia sesi?n para continuar", "Entre para continuar"], ["Continue to Challenge Suite.", "Continuer vers Challenge Suite.", "Continuar a Challenge Suite.", "Continuar para o Challenge Suite."], ["Welcome back to Challenge Suite", "Bon retour sur Challenge Suite", "Te damos la bienvenida de nuevo a Challenge Suite", "Bem-vindo de volta ao Challenge Suite"],
  ["Email Address", "Adresse e-mail", "Correo electr?nico", "Endere?o de e-mail"], ["Password", "Mot de passe", "Contrase?a", "Palavra-passe"], ["Confirm Password", "Confirmer le mot de passe", "Confirmar contrase?a", "Confirmar palavra-passe"], ["Forgot password?", "Mot de passe oubli? ?", "?Olvidaste tu contrase?a?", "Esqueceu a palavra-passe?"],
  ["Join the Challenge Suite community today", "Rejoignez la communaut? Challenge Suite d?s aujourd'hui", "?nete hoy a la comunidad de Challenge Suite", "Junte-se hoje ? comunidade Challenge Suite"], ["First Name", "Pr?nom", "Nombre", "Nome"], ["Last Name", "Nom", "Apellido", "Apelido"], ["First name", "Pr?nom", "Nombre", "Nome"], ["Last name", "Nom", "Apellido", "Apelido"],
  ["Referral code (optional)", "Code de parrainage (facultatif)", "C?digo de referencia (opcional)", "C?digo de refer?ncia (opcional)"], ["Referral code", "Code de parrainage", "C?digo de referencia", "C?digo de refer?ncia"],
  ["After email verification, you will choose whether this account is for competing, creating, hosting, or sponsoring.", "Apr?s la v?rification de l'e-mail, vous choisirez si ce compte sert ? participer, cr?er, organiser ou sponsoriser.", "Despu?s de verificar el correo, elegir?s si esta cuenta es para competir, crear, organizar o patrocinar.", "Ap?s verificar o e-mail, escolher? se esta conta serve para competir, criar, organizar ou patrocinar."],
  ["I accept the Terms of Service", "J'accepte les Conditions d'utilisation", "Acepto los T?rminos del servicio", "Aceito os Termos de servi?o"], ["I accept the Privacy Policy", "J'accepte la Politique de confidentialit?", "Acepto la Pol?tica de privacidad", "Aceito a Pol?tica de privacidade"], ["I accept the Community Guidelines", "J'accepte les R?gles de la communaut?", "Acepto las Normas de la comunidad", "Aceito as Diretrizes da comunidade"],
  ["Already have an account?", "Vous avez d?j? un compte ?", "?Ya tienes una cuenta?", "J? tem uma conta?"], ["Creating account...", "Cr?ation du compte...", "Creando cuenta...", "A criar conta..."], ["Signing in...", "Connexion...", "Iniciando sesi?n...", "A entrar..."],
  ["Enter a valid email address.", "Saisissez une adresse e-mail valide.", "Introduce un correo electr?nico v?lido.", "Introduza um endere?o de e-mail v?lido."], ["Password is required.", "Le mot de passe est requis.", "La contrase?a es obligatoria.", "A palavra-passe ? obrigat?ria."],
  ["First name is required.", "Le pr?nom est requis.", "El nombre es obligatorio.", "O nome ? obrigat?rio."], ["Last name is required.", "Le nom est requis.", "El apellido es obligatorio.", "O apelido ? obrigat?rio."], ["Passwords do not match.", "Les mots de passe ne correspondent pas.", "Las contrase?as no coinciden.", "As palavras-passe n?o coincidem."],
  ["Use at least 8 characters with a number and uppercase letter.", "Utilisez au moins 8 caract?res avec un chiffre et une majuscule.", "Usa al menos 8 caracteres con un n?mero y una may?scula.", "Use pelo menos 8 caracteres com um n?mero e uma mai?scula."], ["Accept all account agreements to continue.", "Acceptez tous les accords du compte pour continuer.", "Acepta todos los acuerdos de la cuenta para continuar.", "Aceite todos os acordos da conta para continuar."],
  ["Earnings", "Revenus", "Ganancias", "Rendimentos"], ["Pending", "En attente", "Pendiente", "Pendente"], ["Available", "Disponible", "Disponible", "Dispon?vel"], ["Withdraw", "Retirer", "Retirar", "Levantar"],
  ["Profile overview", "Aper?u du profil", "Resumen del perfil", "Vis?o geral do perfil"], ["Your Challenge Suite record", "Votre parcours Challenge Suite", "Tu historial en Challenge Suite", "O seu registo no Challenge Suite"], ["At a glance", "En bref", "Resumen", "Resumo"],
  ["Challenge history", "Historique des d?fis", "Historial de desaf?os", "Hist?rico de desafios"], ["Confirmed wins", "Victoires confirm?es", "Victorias confirmadas", "Vit?rias confirmadas"], ["No public activity yet", "Aucune activit? publique", "A?n no hay actividad p?blica", "Ainda sem atividade p?blica"],
  ["Creator workspace unavailable", "Espace cr?ateur indisponible", "Espacio de creador no disponible", "?rea do criador indispon?vel"], ["Search your challenges", "Rechercher vos d?fis", "Buscar tus desaf?os", "Pesquisar os seus desafios"], ["Search sponsor-ready challenges", "Rechercher des d?fis pr?ts pour sponsors", "Buscar desaf?os listos para patrocinadores", "Pesquisar desafios prontos para patrocinadores"],
  ["Notifications", "Notifications", "Notificaciones", "Notifica??es"], ["In-app notifications", "Notifications dans l'application", "Notificaciones en la aplicaci?n", "Notifica??es na aplica??o"], ["Email notifications", "Notifications par e-mail", "Notificaciones por correo", "Notifica??es por e-mail"], ["Push notifications", "Notifications push", "Notificaciones push", "Notifica??es push"],
  ["Complete verification", "Terminer la v?rification", "Completar verificaci?n", "Concluir verifica??o"], ["Verified profile", "Profil v?rifi?", "Perfil verificado", "Perfil verificado"],
];

export const UI_TRANSLATIONS = Object.fromEntries(phrases.map(([en, fr, es, pt]) => [en, { en, fr, es, pt }])) as Record<string, Record<LanguageCode, string>>;
export type TranslationKey = keyof typeof UI_TRANSLATIONS;

export function normalizeLanguage(value: unknown): LanguageCode {
  return SUPPORTED_LANGUAGES.some((language) => language.code === value) ? value as LanguageCode : DEFAULT_LANGUAGE;
}

export function readBrowserLanguagePreference(): LanguageCode {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored) return normalizeLanguage(stored);
  } catch {}
  const prefix = `${LANGUAGE_STORAGE_KEY}=`;
  const cookie = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return normalizeLanguage(cookie ? decodeURIComponent(cookie.slice(prefix.length)) : undefined);
}

export function translate(language: LanguageCode, key: string) {
  return UI_TRANSLATIONS[key]?.[language] ?? UI_TRANSLATIONS[key]?.en ?? readableFallback(key);
}

function readableFallback(key: string) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key) || !/[A-Z]/.test(key.slice(1))) return key;
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function translateFirstPartyText(language: LanguageCode, value: string) {
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const core = value.trim();
  return core ? `${leading}${translate(language, core)}${trailing}` : value;
}
