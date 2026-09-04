export function Safety() {
  return (
    <>
      <h2>Safety limits</h2>
      <div className="banner">
        Phrase cards are the source of truth. Speech is a draft. This is not a medical device and not an official
        interpreter.
      </div>
      <ul>
        <li>Do not use the app for informed consent, medication orders, or diagnosis.</li>
        <li>Do not paste draft text into HIS/EMR.</li>
        <li>Chest pain, heavy bleeding, unresponsive patient, blue lips, seizure: emergency cards + licensed staff.</li>
        <li>Patient may refuse the tool and ask for a Turkish nurse at any time.</li>
      </ul>
    </>
  );
}
