# Dev Notes - PLMun Nexus

random notes ko habang ginagawa yung system para di ko makalimutan

## Setup reminders
- `cd Backend && python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt`
- `python manage.py migrate` before anything else
- `cd frontend && npm install && npm run dev`
- yung `.env` file sa Backend, copy mo yung `.env.example` tapos palitan yung values

## Known Issues
- yung idle timer nag-cocountdown pa rin kahit naka-background yung tab
  - mababa priority, di naman mahalaga masyado basta mag lo-logout after 30min
- minsan nag o-overlap yung flash messages sa Settings pag nag click ng maaga
- yung dark mode ng select dropdowns sa InventoryFormModal hindi pa maayos
- may error sa console kapag walang items sa inventory (division by zero sa pie chart)

## Mga bagay na pinag-usapan namin ng group ko
- pag-add ng 2FA (maybe Phase 2)
- email notifications (hindi pa kasama for now, frontend lang muna)
- student year level field sa registration
- mobile app version using React Native - "baka next sem"

## Performance notes
- yung Dashboard medyo mabagal pag maraming items kasi 3 API calls sa mount
  - fetchInventory + fetchInventoryStats + fetchRequests + checkOverdue (4 pala)
  - pwede sigurong gawing isang combined endpoint
- yung comments nag po-poll every 5 seconds - sana WebSocket pero masyadong complex

## Mga na-delete ko
- yung Unity game files (dati may project dito)
- old scratch notes and temporary review comments