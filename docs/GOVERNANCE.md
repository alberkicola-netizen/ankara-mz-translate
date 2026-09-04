# Steering group, KVKK / IT, and phrase review

**Programme:** Ankara University + TİKA + Mozambique Ministry of Health (maternal and child health).  
**Tool:** TİKA Ankara University – Mozambique Translator — communication aid, not an interpreter and not a medical device.

## Steering group (pilot)

| Seat | Role in this tool |
| --- | --- |
| Faculty of Nursing coordinator | Training, observer onboarding, glossary later |
| Hospital nursing directorate | Ward access, preceptor time, freeze authority |
| Obstetric or neonatal clinician | Clinical sign-off of maternity / NICU phrases |
| TİKA / project coordinator | Cohort list, observer PIN distribution |
| Mozambican nurse representative | Phrase naturalness (Portuguese as used by the cohort) |
| Hospital IT / KVKK contact | Hosting, PIN policy, no-PHI rule |

Meet before go-live, after week 2 of the pilot, and at week 4 close-out. Any **medication or allergy misunderstanding** attributed to the app freezes that category until the clinician and nurse representative re-approve the pack.

## What the tool may and must not do

- **May:** show reviewed PT / TR / EN phrases; play speech for those phrases; draft free-text or microphone translation labelled for staff confirmation.
- **Must not:** replace informed consent, medication orders, or diagnosis; store names, file numbers, photos of charts; write into the hospital HIS/EMR; claim to be a certified interpreter.

## Cohort access (v1)

- Closed **invite URL + PIN** (default for local demo: `AU2026`). Change the PIN before any real ward use (`VITE_COHORT_PIN` at build, or Settings after unlock for the session only does not change the gate).
- University SSO is out of scope for v1.
- Distribute the PIN only to the current observer cohort and named preceptors.

## KVKK and hospital IT

- **No personal health data** on the device by design: no patient names, IDs, photos, or free-text notes that include identifiers.
- Optional **anonymous** counters (category taps, language pair) stay on-device unless the IT / ethics contact approves a later export with no identifiers.
- Speech: audio is processed in the browser when possible; draft machine translation sends **text only**, never stored by this app. Do not enable draft translation on a ward until IT accepts the chosen provider (or disable it and use phrasebook-only matching).
- Host the production build on a **university or Turkey-approved** server. Do not put PHI in logs.

See also [KVKK_IT.md](KVKK_IT.md) and [PHRASE_REVIEW.md](PHRASE_REVIEW.md).
