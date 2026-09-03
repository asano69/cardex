.PHONY: lint

include myapp.env
export

BINARY := myapp

# Ports used by the dev servers (frontend, backend, and PocketBase-style API)
PORTS := 3000 3001

.PHONY: all
all: # (*) Build frontend assets and start the server
	go run ./cmd/$(BINARY) superuser upsert admin@mail.internal password --dir=pb_data
	go run ./cmd/$(BINARY) serve


init:
	fastmod --hidden myapp $(notdir $(CURDIR)) --glob '!Makefile'
	fastmod --hidden MYAPP $(shell echo '$(notdir $(CURDIR))' | tr '[:lower:]' '[:upper:]') --glob '!Makefile'
	find . -depth \( -type f -o -type d \) -name '*myapp*' | while read -r f; do \
		mv -- "$$f" "$$(dirname "$$f")/$$(basename "$$f" | sed 's/myapp/$(notdir $(CURDIR))/g')"; \
	done
	fastmod myapp $(notdir $(CURDIR))



.PHONY: frontend-deps
frontend-deps:
	cd frontend && bun install

.PHONY: build-frontend
build-frontend: frontend-deps
	cd frontend && bun run build

.PHONY: build
build: build-frontend
	go build -ldflags="-X github.com/asano69/myapp/internal/version.Version=$(VERSION)" -o $(BINARY) ./cmd/$(BINARY)

.PHONY: server
server: 
	#./myapp migrate up --dir=pb_data
	./$(BINARY) superuser upsert admin@mail.internal password --dir=pb_data
	./$(BINARY) serve --dev

# --------------
.PHONY: clean
	rm -fr ./tmp/ # air

# port: 3001
.PHONY: dev-front
dev-front: clean
	bunx concurrently -n "frontend,backend" -c "blue,green" "cd frontend && bun dev" "go run ./cmd/$(BINARY) serve --dev"

# port: 3000
.PHONY: dev-back
dev-back: clean
	bunx concurrently -n "frontend,backend" -c "blue,green" "cd frontend && bun watch" "air"


.PHONY: test
test:
	#cd frontend && bun test
	go test  ./...

lint: typecheck
	golangci-lint run
	cd frontend && bun run lint

.PHONY: typecheck
typecheck:
	cd frontend && bun run typecheck



format:
	cd frontend && bunx prettier --write "src/**/*.{js,jsx,ts,tsx,css}"

# 本番では、後方互換性のために残しておいたほうが良いかも。
migrate-collections:
	ls -1 migrations/*.go | sort | head -n -1 | xargs rm -f
	yes | go run ./cmd/myapp migrate collections
	ls -1 migrations/*.go | sort | head -n -1 | xargs rm -f
