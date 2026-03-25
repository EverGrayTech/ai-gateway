# Backend Standards

## Technology Stack
- **Framework**: FastAPI
- **Package Manager**: uv (use `uv run`, `uv add` for all operations)
- **Linting/Formatting**: Ruff

## Code Organization
- Alphabetize functions and methods within classes
- Use strict type hinting throughout
- Keep code modular and well-organized

## Data Validation
- Use Pydantic V2 for all data models
- Apply strict type validation

## Architecture Principles
- Keep the backend stateless
- Never perform blocking I/O in `async` routes
- Use appropriate async patterns for concurrent operations
