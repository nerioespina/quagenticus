.PHONY: up down restart logs ps build db-shell

up:
	docker compose up -d --build

down:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f

ps:
	docker compose ps

build:
	docker compose build

db-shell:
	docker compose exec -it db psql -U qg -d quagenticus
