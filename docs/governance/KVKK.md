# KVKK / IT rules (v1 closed cohort)

Turkey’s KVKK (personal data protection) applies to any processing of identifiable people. This tool is designed so **v1 does not process patient personal data**.

## Allowed on the phone

- Approved phrase library (PT / TR / EN) and cached TTS audio.  
- User preferences: UI language, dark mode, **favorites** (phrase IDs only).  
- Cohort gate: a **shared PIN** (not a personal account).  
- Optional **anonymous** usage counters: ward code, phrase category, language spoken — **only if** IT/DPO ticks “yes” on the pilot checklist. Default in this build: **off** (nothing leaves the device).

## Forbidden (v1)

- Names, protocol numbers, T.C. IDs, phone numbers, photos of charts, wristbands, or faces.  
- Recording or uploading microphone audio to any server. Speech (phase 2) uses **on-device / browser** recognition when available; audio must not be retained.  
- Draft machine translation of free text is labeled draft; it must not be pasted into HIS/EMR as an official note.  
- Cloud translation APIs unless IT names an approved endpoint and a **no-retention** contract. This app’s phase-2 draft path prefers **phrasebook matching**; it does not send audio to a third party.

## Legal bases (if any personal data of staff/observers is added later)

University SSO or named accounts would require a hospital IT ticket, privacy notice, and retention schedule. **v1 uses PIN + invite URL only.**

## Hosting

- Prefer university server or a Turkey-region host approved by hospital IT.  
- HTTPS. No PHI in logs.  
- Service worker caches the phrase pack for offline wards.

## Patient notice

Ward poster (pilot): staff may use a three-language phrase tool; the patient may request a Turkish nurse at any time. Template: [../pilot/WARD_POSTER.md](../pilot/WARD_POSTER.md).

## Incident freeze

If a phrase is linked to a medication, allergy, or consent misunderstanding: take the category offline in the next pack, notify the steering chair the same shift, and do not re-enable until dual review.
