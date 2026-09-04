export function Governance() {
  return (
    <>
      <h2>Steering group</h2>
      <p>
        Faculty of Nursing chair, obstetric/neonatal clinical lead, ward preceptor, Mozambique nurse
        representative, TİKA/programme liaison, hospital IT/KVKK.
      </p>
      <p>Quorum: chair + clinical lead + preceptorship + Mozambique or TİKA liaison. IT for any data/API change.</p>
      <h3>KVKK (v1)</h3>
      <ul>
        <li>No patient names, IDs, or photos of charts.</li>
        <li>PIN cohort access. Favorites are phrase IDs only.</li>
        <li>No audio uploaded. Speech stays in the browser.</li>
        <li>Allergy/medication misunderstanding → freeze that category.</li>
      </ul>
      <p className="muted">Full text in docs/governance/ on the project repository.</p>
    </>
  );
}
