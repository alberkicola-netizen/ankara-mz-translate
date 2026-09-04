# KVKK and hospital IT checklist

This app is a **communication aid**. It is not a medical record and must not hold sağlık verisi (health data) about identifiable patients.

## Data inventory (v1)

| Data | Where | Legal note |
| --- | --- | --- |
| Cohort PIN check (yes/no in session) | `sessionStorage` | Access control, not health data |
| UI language, dark mode, preceptor phone | `localStorage` | User preference |
| Favourite phrase IDs | `localStorage` | No patient link |
| Phrase pack overlay (admin edits) | `localStorage` | Institutional content |
| Anonymous tap counts (optional) | `localStorage` | Only if steering group allows; no names |
| Draft speech text | Memory only, then discarded | Never save; confirm with staff |

## Rules for the ward

1. Do not photograph patients, wristbands, or screens into this app (the app has no camera capture).
2. Do not type patient names into Search, Speech, or Admin.
3. Preceptor `tel:` number should be a **staff duty phone**, not a personal number stored as “patient contact”.
4. Production hosting: TLS, university account for deploy, no public search indexing of the PIN page if possible.

## Incident freeze

If a user reports a wrong allergy or medicine meaning, nursing directorate **freezes** `allergies_meds` in Admin until phrase review is complete. The PWA shows a freeze banner for that category.
