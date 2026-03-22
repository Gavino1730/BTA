# Contributing to Valley Catholic Basketball Stats

First off, thank you for considering contributing to this project! 🎉

The following is a set of guidelines for contributing to the Valley Catholic Basketball Stats platform. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Pull Request Process](#pull-request-process)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)

## Code of Conduct

This project and everyone participating in it is governed by our commitment to creating a welcoming and respectful environment. Please be respectful and constructive in all interactions.

### Our Standards

- ✅ Using welcoming and inclusive language
- ✅ Being respectful of differing viewpoints and experiences
- ✅ Gracefully accepting constructive criticism
- ✅ Focusing on what is best for the community
- ✅ Showing empathy towards other community members

## How Can I Contribute?

### 🐛 Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When creating a bug report, include as many details as possible:

**Bug Report Template:**
```markdown
**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment:**
 - OS: [e.g. Windows 11, macOS 14]
 - Browser: [e.g. Chrome 120, Firefox 121]
 - Python Version: [e.g. 3.11.5]
 - App Version: [e.g. commit hash]

**Additional context**
Any other context about the problem.
```

### ✨ Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

**Enhancement Template:**
```markdown
**Is your feature request related to a problem?**
A clear description of the problem. Ex. I'm always frustrated when [...]

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
Any alternative solutions or features you've considered.

**Additional context**
Any other context or screenshots about the feature request.
```

### 📝 Your First Code Contribution

Unsure where to begin? You can start by looking through these issues:
- `good-first-issue` - Issues suitable for beginners
- `help-wanted` - Issues that need attention

### 🔧 Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. If you've changed APIs, update the documentation
4. Ensure the test suite passes
5. Make sure your code follows the existing style
6. Write a clear pull request description

## Development Setup

### Prerequisites

- Python 3.11+
- pip
- Virtual environment tool (venv)
- Git

### Setup Steps

```bash
# Clone your fork
git clone https://github.com/your-username/vc-basketball-stats.git
cd vc-basketball-stats

# Add upstream remote
git remote add upstream https://github.com/original/vc-basketball-stats.git

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install development dependencies
pip install pytest black flake8 mypy pytest-cov

# Set up environment
cp .env.example .env
# Edit .env with your test API keys

# Run tests to verify setup
pytest tests/

# Start development server
python main.py
```

### Development Workflow

```bash
# Create a feature branch
git checkout -b feature/your-feature-name

# Make your changes
# ... edit files ...

# Run tests
pytest tests/

# Format code
black src/ tests/

# Lint code
flake8 src/ tests/

# Commit your changes
git add .
git commit -m "Add: brief description of changes"

# Push to your fork
git push origin feature/your-feature-name

# Open a Pull Request on GitHub
```

## Coding Standards

### Python Style Guide

We follow [PEP 8](https://pep8.org/) with some modifications:

- **Line Length**: 100 characters (not 79)
- **Imports**: Organized in three groups (stdlib, third-party, local)
- **Docstrings**: Google style for all public functions and classes
- **Type Hints**: Required for all function signatures

### Code Formatting

We use `black` for automatic code formatting:

```bash
# Format all Python files
black src/ tests/

# Check formatting without changes
black --check src/ tests/
```

### Example Function

```python
from typing import List, Dict, Optional


def calculate_player_efficiency(
    player_name: str,
    games: List[Dict],
    min_games: int = 3
) -> Optional[float]:
    """Calculate player efficiency rating across games.
    
    Args:
        player_name: Name of the player to analyze
        games: List of game dictionaries with player stats
        min_games: Minimum games required for calculation
        
    Returns:
        Player efficiency rating, or None if insufficient games
        
    Raises:
        ValueError: If games list is empty
        
    Example:
        >>> calculate_player_efficiency("John Doe", games_list, min_games=5)
        15.7
    """
    if not games:
        raise ValueError("Games list cannot be empty")
        
    player_games = [g for g in games if g.get('player') == player_name]
    
    if len(player_games) < min_games:
        return None
        
    # Calculate efficiency...
    return efficiency_rating
```

### JavaScript Style Guide

- Use modern ES6+ syntax
- Use `const` and `let`, never `var`
- Use async/await for asynchronous code
- Add JSDoc comments for functions
- Use meaningful variable names

### Example JavaScript

```javascript
/**
 * Fetch player statistics from API
 * @param {string} playerName - Name of the player
 * @returns {Promise<Object>} Player statistics object
 */
async function fetchPlayerStats(playerName) {
    try {
        const response = await fetch(`/api/players/${playerName}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch player stats:', error);
        throw error;
    }
}
```

### File Structure

- Keep files focused and under 500 lines when possible
- Use clear, descriptive filenames
- Group related functionality
- Separate concerns (models, views, controllers)

### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Variables | `snake_case` | `player_stats` |
| Functions | `snake_case` | `calculate_efficiency()` |
| Classes | `PascalCase` | `PlayerStats` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_PLAYERS` |
| Private | `_leading_underscore` | `_internal_method()` |

## Pull Request Process

### Before Submitting

- [ ] Code follows the style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests added/updated and passing
- [ ] Local testing completed

### PR Title Format

Use conventional commit format:

- `feat: Add player comparison feature`
- `fix: Correct calculation in eFG% formula`
- `docs: Update API documentation`
- `style: Format code with black`
- `refactor: Simplify data loading logic`
- `test: Add tests for advanced stats`
- `chore: Update dependencies`

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing existing functionality to break)
- [ ] Documentation update

## How Has This Been Tested?
Describe the tests you ran

## Checklist
- [ ] My code follows the style guidelines
- [ ] I have performed a self-review
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
```

### Review Process

1. A maintainer will review your PR within 3-5 business days
2. Address any requested changes
3. Once approved, a maintainer will merge your PR
4. Your contribution will be included in the next release

## Testing Guidelines

### Running Tests

```bash
# Run all tests
pytest tests/

# Run specific test file
pytest tests/test_advanced_stats.py

# Run with coverage
pytest --cov=src tests/

# Run with verbose output
pytest -v tests/
```

### Writing Tests

- Write tests for all new features
- Maintain >80% code coverage
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Mock external dependencies (API calls, database)

### Test Example

```python
import pytest
from src.advanced_stats import calculate_effective_fg_percentage


class TestAdvancedStats:
    """Tests for advanced statistics calculations."""
    
    def test_calculate_efg_with_valid_data(self):
        """Test eFG% calculation with valid player data."""
        # Arrange
        player_data = {
            'fgm': 10,
            'three_pm': 3,
            'fga': 25
        }
        
        # Act
        result = calculate_effective_fg_percentage(player_data)
        
        # Assert
        expected = (10 + 0.5 * 3) / 25 * 100
        assert result == pytest.approx(expected, rel=1e-2)
    
    def test_calculate_efg_with_zero_attempts(self):
        """Test eFG% returns 0 when no field goal attempts."""
        # Arrange
        player_data = {'fgm': 0, 'three_pm': 0, 'fga': 0}
        
        # Act
        result = calculate_effective_fg_percentage(player_data)
        
        # Assert
        assert result == 0.0
```

## Documentation

### Code Documentation

- Add docstrings to all public functions, classes, and modules
- Use Google-style docstrings
- Include examples where helpful
- Document exceptions and edge cases

### Documentation Files

When adding features, update relevant documentation:

- `README.md` - Main project documentation
- `docs/API.md` - API endpoint documentation
- `docs/DEPLOYMENT.md` - Deployment instructions
- Inline code comments for complex logic

### Commit Messages

Write clear commit messages:

```
Add player volatility analysis feature

- Implement standard deviation calculation for player stats
- Add volatility endpoint to API
- Update player profile page with consistency metrics
- Add tests for volatility calculations

Closes #123
```

## Questions?

Feel free to:
- Open an issue for discussion
- Reach out to maintainers
- Join our community discussions

## Recognition

Contributors will be recognized in:
- `CONTRIBUTORS.md` file
- Release notes
- Project documentation

Thank you for contributing! 🎉🏀
