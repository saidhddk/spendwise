// FR-21: privacy notice shown at registration, in English and French, under Tunisian
// personal-data law (Organic Law No. 2004-63 of 27 July 2004).

export default function PrivacyNotice() {
  return (
    <section aria-labelledby="privacy" className="space-y-4 rounded-lg border border-line bg-card p-4">
      <div lang="en" className="space-y-2">
        <h2 id="privacy" className="text-lg font-semibold">Privacy notice</h2>
        <p><strong>What we store:</strong> your email address, a bcrypt hash of your password (never the password), and the transactions you enter (amount, type, category, date, note). For security we log logins and account actions with your account number, IP address and time, never your email or your transactions.</p>
        <p><strong>Why:</strong> only to run your private expense tracker and to protect your account. No ads, no tracking, no sharing.</p>
        <p><strong>How long:</strong> until you delete your account. Encrypted backups are kept 30 days, security logs 90 days. Accounts not confirmed within 24 hours are deleted.</p>
        <p><strong>How to delete it:</strong> Settings → Delete my account removes your account and all your data.</p>
        <p>Processing follows Tunisian Organic Law No. 2004-63 on the protection of personal data.</p>
      </div>
      <div lang="fr" className="space-y-2 border-t border-line pt-4">
        <h2 className="text-lg font-semibold">Avis de confidentialité</h2>
        <p><strong>Ce que nous conservons :</strong> votre adresse e-mail, une empreinte bcrypt de votre mot de passe (jamais le mot de passe) et les opérations que vous saisissez (montant, type, catégorie, date, note). Pour la sécurité, nous journalisons les connexions et les actions sur le compte avec votre numéro de compte, votre adresse IP et l&apos;heure, jamais votre e-mail ni vos opérations.</p>
        <p><strong>Pourquoi :</strong> uniquement pour faire fonctionner votre suivi de dépenses privé et protéger votre compte. Pas de publicité, pas de pistage, pas de partage.</p>
        <p><strong>Combien de temps :</strong> jusqu&apos;à la suppression de votre compte. Les sauvegardes chiffrées sont gardées 30 jours, les journaux de sécurité 90 jours. Les comptes non confirmés sous 24 heures sont supprimés.</p>
        <p><strong>Comment les supprimer :</strong> Paramètres → Supprimer mon compte efface votre compte et toutes vos données.</p>
        <p>Le traitement respecte la loi organique tunisienne n° 2004-63 sur la protection des données à caractère personnel.</p>
      </div>
    </section>
  );
}
