# 🔥 Night Market
## *The Underground Network for Sneaker Culture*

[![Python Version](https://img.shields.io/badge/python-3.11-blue.svg)](https://www.python.org/downloads/release/python-3110/)
[![CI](https://github.com/myspacecornelius/Night Market/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/myspacecornelius/Night Market/actions/workflows/ci-cd.yml)
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/myspacecornelius/Night Market)

---

> *"In a world of bots and backdoors, we're building something different.  
> A place where sneaker culture thrives on community, not just code.  
> Where your contribution matters more than your connections.  
> Welcome to Night Market."*

---

## 🌟 The Vision

**Night Market isn't just another sneaker bot.** It's the foundation for a new kind of sneaker community—one that rewards authenticity, celebrates local culture, and puts power back in the hands of real enthusiasts.

### What We're Building

- **🗺️ Hyperlocal Heatmaps**: Real-time signals from sneakerheads in your city
- **🪙 LACES Token Economy**: Earn rewards for contributing to the community  
- **🎯 Drop Zones**: Coordinate releases, share intel, build together
- **🤝 Community-First**: No gatekeeping, no backdoors—just pure sneaker culture
- **🔒 Privacy by Design**: Your data stays yours, always

### Why It Matters

The sneaker game has been hijacked by corporate interests and exclusive access. **Night Market brings it back to the streets.** We're creating infrastructure that serves the community, not just the highest bidder.

---

## 🚀 Quick Start
*Get Night Market running in under 3 minutes*

### Prerequisites
- Docker Desktop installed and running
- Git (for cloning)
- 5 minutes of your time

### The 3-Step Onboarding

```bash
# 1️⃣ Clone and enter Night Market
git clone https://github.com/myspacecornelius/Night Market.git
cd Night Market

# 2️⃣ Set up your environment  
make setup

# 3️⃣ Launch the underground network
make up
```

**That's it.** Open your browser to `http://localhost:5173` and witness Night Market come alive.

### What You'll See

- **📱 Live Community Feed**: Real sneaker signals from Boston, NYC, LA, and Chicago
- **🗺️ Interactive Heatmap**: See where the culture is happening
- **👟 Upcoming Drops**: Community-curated release calendar
- **🪙 LACES Economy**: Token rewards for authentic participation
- **📊 Analytics Dashboard**: Community health and engagement metrics

---

## 🏗️ Architecture
*Built for scale, designed for community*

### The Stack

```
🎨 Frontend     → React + Vite + Tailwind (Modern, Fast, Beautiful)
🔌 API          → FastAPI + SQLAlchemy (Python, Type-Safe, Async)
🗄️ Database     → PostgreSQL + PostGIS (Geospatial, Reliable)
⚡ Cache        → Redis (Lightning Fast)
🔄 Workers      → Celery (Background Tasks, Scalable)
📊 Monitoring   → Grafana + Prometheus (Observability)
🐳 Infrastructure → Docker Compose (One Command Deploy)
```

### Key Services

- **`api`** - Core FastAPI application serving the community
- **`frontend`** - React app where the magic happens
- **`worker`** - Background tasks for notifications, data processing
- **`postgres`** - Community data with geospatial superpowers
- **`redis`** - Real-time caching and message queuing
- **`grafana`** - Beautiful dashboards for community insights

---

## 🛠️ Development Guide
*Join the builders*

### Essential Commands

```bash
make help      # 📖 See all available commands
make up        # 🚀 Start all services  
make down      # 🛑 Stop everything
make logs      # 📋 Watch the magic happen
make doctor    # 🩺 Health check your setup
make test      # 🧪 Run the test suite
make clean     # 🧹 Clean slate reset
```

### Project Structure

```
Night Market/
├── 🎨 frontend/          # React app - where users experience Night Market
├── 🔌 backend/           # FastAPI core - the community engine
│   ├── api/             # REST endpoints
│   ├── models/          # Database schemas  
│   ├── core/            # Business logic
│   └── alembic/         # Database migrations
├── 👷 worker/            # Celery background tasks
├── 📊 infra/            # Monitoring and observability
├── 🧪 tests/            # Quality assurance
└── 🐳 docker-compose.yml # One-command infrastructure
```

### Adding Features

**Want to contribute?** Here's how to add value to the community:

1. **New API Endpoints**: Add to `backend/api/`
2. **Database Models**: Extend `backend/models/`
3. **Frontend Components**: Build in `frontend/src/components/`
4. **Background Tasks**: Create in `worker/tasks.py`
5. **Tests**: Always add to `tests/`

### Code Philosophy

- **🎯 Purpose-Driven**: Every line serves the community
- **🔒 Privacy-First**: User data protection is non-negotiable  
- **⚡ Performance**: Fast is a feature
- **🧪 Tested**: Quality over quantity
- **📖 Documented**: Code should tell a story

---

## 🌍 The Community
*This is bigger than code*

### How to Contribute

**🐛 Found a Bug?** Open an issue with details and steps to reproduce.

**💡 Have an Idea?** Start a discussion—we love hearing from the community.

**🔧 Want to Code?** 
1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a PR with a clear description

**📖 Improve Docs?** Documentation PRs are always welcome.

### Community Values

- **🤝 Inclusive**: Everyone belongs in sneaker culture
- **🔒 Transparent**: Open source, open process, open community
- **🎯 Authentic**: Real people, real passion, real impact
- **🚀 Innovative**: Push boundaries, challenge norms
- **🌱 Sustainable**: Build for the long term

---

## 🪙 LACES Token Economy
*Rewarding authentic participation*

### How You Earn LACES

- **📍 Location Signals**: Share real-time sneaker intel
- **🤝 Community Help**: Assist with legit checks, sizing, advice
- **🔧 Code Contributions**: Build features, fix bugs, improve docs
- **📊 Data Quality**: Accurate drop info, store updates
- **🎨 Content Creation**: Guides, tutorials, community resources

### What LACES Unlock

- **🎯 Priority Access**: Early access to new features
- **🗳️ Governance Rights**: Vote on community decisions
- **🏆 Recognition**: Leaderboards and community status
- **🎁 Exclusive Content**: Special drops, insider info
- **🤝 Networking**: Connect with other high-value contributors

---

## 🔧 Configuration
*Customize your Night Market experience*

### Environment Variables

Copy `.env.example` to `.env` and customize:

```bash
# 🗄️ Database
DATABASE_URL=postgresql://Night Market:password@postgres:5432/Night Market

# ⚡ Cache  
REDIS_URL=redis://redis:6379/0

# 🔌 API
API_PORT=8000
JWT_SECRET_KEY=your_secret_here

# 🎨 Frontend
FRONTEND_PORT=5173
VITE_API_URL=http://localhost:8000

# 🌱 Demo Data
AUTO_SEED_DATA=true
DEMO_USERS_COUNT=50
DEMO_POSTS_COUNT=200
```

### Advanced Configuration

- **🔒 Security**: Configure JWT, CORS, rate limiting
- **📊 Monitoring**: Set up Grafana dashboards
- **🌐 Deployment**: Production environment variables
- **🔧 Workers**: Celery task configuration

---

## 🚀 Deployment
*Take Night Market to production*

### Docker Compose (Recommended)

```bash
# Production deployment
docker compose -f docker-compose.prod.yml up -d
```

### Cloud Deployment

Night Market is designed to run anywhere:

- **☁️ AWS**: ECS, RDS, ElastiCache
- **🌊 DigitalOcean**: App Platform, Managed Databases  
- **🔵 Azure**: Container Instances, PostgreSQL
- **🌐 Google Cloud**: Cloud Run, Cloud SQL
- **⚡ Railway/Render**: One-click deployment

---

## 📊 Monitoring & Observability

### Built-in Dashboards

- **📈 Grafana**: `http://localhost:3000` (admin/admin)
- **🔍 Prometheus**: `http://localhost:9090`
- **🩺 Health Checks**: `http://localhost:8000/health`

### Key Metrics

- **👥 Community Growth**: User registrations, engagement
- **📍 Location Activity**: Geographic distribution of signals
- **🪙 Token Economy**: LACES circulation, earning patterns
- **⚡ Performance**: API response times, error rates
- **🔧 Infrastructure**: Database performance, worker queues

---

## 🤝 Join the Movement

### Connect With Us

- **💬 Discord**: [Join our community](https://discord.gg/Night Market)
- **🐦 Twitter**: [@Night MarketNetwork](https://twitter.com/Night Marketnetwork)
- **📧 Email**: community@Night Market.network
- **🌐 Website**: [Night Market.network](https://Night Market.network)

### Support the Project

- **⭐ Star the Repo**: Show your support
- **🔄 Share**: Spread the word in your community
- **🐛 Report Issues**: Help us improve
- **💰 Sponsor**: Support ongoing development

---

## 📜 License

MIT License - see [LICENSE](LICENSE) for details.

Built with ❤️ by the sneaker community, for the sneaker community.

---

## 🔥 Ready to Build?

```bash
git clone https://github.com/myspacecornelius/Night Market.git
cd Night Market
make setup && make up
```

**Welcome to the underground. Let's build the future of sneaker culture together.**

---

*"The best way to predict the future is to build it."*  
*— The Night Market Community*
