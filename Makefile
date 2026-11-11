# =============================================================================
# DHARMA DEVELOPMENT MAKEFILE
# =============================================================================
# Your gateway to the underground sneaker network
# 
# Quick start: make up
# Full setup:  make setup && make up
# =============================================================================

.PHONY: help setup up down logs doctor test migrate seed clean reset status

# Default target - show help
help:
	@echo "🔥 DHARMA - The Underground Network for Sneaker Culture 🔥"
	@echo ""
	@echo "Essential Commands:"
	@echo "  make up      🚀 Start the entire Dharma stack"
	@echo "  make down    🛑 Stop all services"
	@echo "  make logs    📋 Follow service logs"
	@echo "  make doctor  🩺 Health check your environment"
	@echo ""
	@echo "Setup Commands:"
	@echo "  make setup   ⚙️  Initial environment setup"
	@echo "  make migrate 🗄️  Run database migrations"
	@echo "  make seed    🌱 Populate demo data"
	@echo "  make reset   🔄 Full reset (careful!)"
	@echo ""
	@echo "Development:"
	@echo "  make test    🧪 Run test suite"
	@echo "  make clean   🧹 Clean up containers and volumes"
	@echo "  make status  📊 Show service status"
	@echo ""

# Health check - verify environment is ready
doctor:
	@echo "🩺 Running Dharma health check..."
	@test -f .env || (echo "❌ Missing .env file. Run: make setup"; exit 1)
	@command -v docker >/dev/null || (echo "❌ Docker not found. Install Docker first."; exit 1)
	@docker info >/dev/null 2>&1 || (echo "❌ Docker daemon not running. Start Docker first."; exit 1)
	@echo "✅ Environment looks good!"

# Initial setup - copy env file and bootstrap
setup:
	@echo "⚙️ Setting up Dharma development environment..."
	@if [ ! -f .env ]; then \
		echo "📋 Creating .env from .env.example with a private JWT secret..."; \
		secret=$$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))"); \
		test -n "$$secret" || { echo "❌ Could not generate a JWT secret (need openssl or python3)"; exit 1; }; \
		grafana=$$(openssl rand -hex 12 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(12))"); \
		awk -v secret="$$secret" -v grafana="$$grafana" '/^JWT_SECRET_KEY=/ { print "JWT_SECRET_KEY=" secret; next } /^GRAFANA_ADMIN_PASSWORD=/ { print "GRAFANA_ADMIN_PASSWORD=" grafana; next } { print }' .env.example > .env; \
		echo "✅ Created .env file"; \
		echo "💡 Edit .env if you need custom configuration"; \
	else \
		echo "✅ .env file already exists"; \
	fi
	@if [ -f scripts/bootstrap_envs.sh ]; then \
		echo "🔧 Running environment bootstrap..."; \
		./scripts/bootstrap_envs.sh; \
	fi
	@echo "🎉 Setup complete! Run 'make up' to start Dharma"

# Start all services
up: doctor
	@echo "🚀 Starting Dharma services..."
	@docker compose up -d --build
	@echo ""
	@echo "🔥 Dharma is starting up!"
	@echo "📱 Frontend: http://localhost:5173"
	@echo "🔌 API: http://localhost:8000"
	@echo "📊 Grafana: http://localhost:3001"
	@echo "📈 Prometheus: http://localhost:9090"
	@echo ""
	@echo "⏳ Services are initializing... Run 'make logs' to watch progress"
	@echo "🩺 Run 'make status' to check service health"

# Stop all services
down:
	@echo "🛑 Stopping Dharma services..."
	@docker compose down
	@echo "✅ All services stopped"

# Follow logs from all services
logs:
	@echo "📋 Following Dharma service logs (Ctrl+C to exit)..."
	@docker compose logs -f --tail=100

# Show service status
status:
	@echo "📊 Dharma Service Status:"
	@docker compose ps

# Run database migrations
migrate:
	@echo "🗄️ Running database migrations..."
	@docker compose exec api alembic upgrade head
	@echo "✅ Migrations complete"

# Seed demo data
seed:
	@echo "🌱 Seeding demo data..."
	@docker compose exec api python -m services.seed
	@echo "✅ Demo data populated"

# Run tests
test:
	@echo "🧪 Running Dharma test suite..."
	@if [ -f frontend/package.json ]; then \
		echo "Testing frontend..."; \
		(cd frontend && npm test -- --run); \
	fi
	@if [ -f requirements.txt ]; then \
		echo "Testing backend..."; \
		docker compose exec postgres sh -c 'createdb -U "$$POSTGRES_USER" dharma_test 2>/dev/null || true'; \
		docker compose exec -w /app api sh -c 'TEST_DATABASE_URL="postgresql://$$POSTGRES_USER:$$POSTGRES_PASSWORD@postgres:5432/dharma_test" python -m pytest -v'; \
	fi

# Clean up containers and volumes
clean:
	@echo "🧹 Cleaning up Docker resources..."
	@docker compose down -v --remove-orphans
	@echo "✅ Cleanup complete"

# Full reset - nuclear option
reset: clean
	@echo "🔄 Performing full Dharma reset..."
	@docker compose down -v --remove-orphans --rmi all
	@echo "⚠️  All containers, volumes, and images removed"
	@echo "💡 Run 'make up' to rebuild everything"

# Development mode with hot reload
dev: up
	@echo "🔥 Dharma development mode active"
	@echo "💡 Code changes will auto-reload"
	@make logs
