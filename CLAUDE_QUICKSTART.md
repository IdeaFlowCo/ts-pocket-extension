# Claude Quick Start Guide

## 🚀 Get Started in 30 Seconds

```bash
# Start Claude
claude

# Ask for help
> /help

# Read a file
> @src/main.js

# Search for something
> find all TODO comments

# Make changes
> fix the bug in auth.js line 45
```

## 📚 Essential References

1. **Full Manual**: `CLAUDE_MANUAL.md` - Complete tool directory
2. **10x Workflow**: `10x-workflow-enhanced.sh` - Parallel development
3. **Common Workflows**: See manual section 4

## 🛠 Top 5 Tools You'll Use

1. **@file** - Reference files instantly
2. **Grep** - Search file contents  
3. **Edit** - Make precise changes
4. **Bash** - Run commands
5. **TodoWrite** - Track complex tasks

## 💡 Pro Tips

### Parallel Development
```bash
# Work on multiple features simultaneously
./10x-workflow-enhanced.sh auth-feature start --worktree
./10x-workflow-enhanced.sh api-feature start --worktree

# Check all active work
./10x-workflow-enhanced.sh list
```

### Time Tracking
```bash
# Automatic time tracking included!
./10x-workflow-enhanced.sh feature-name status
```

### Custom Commands
```bash
# Create project command
echo "Review for security issues:" > .claude/commands/security.md

# Use it
> /project:security
```

## 🔍 Common Patterns

### Find and Fix
```
> search for deprecated API usage
> update all instances to use new API
```

### Understand and Refactor
```
> explain how authentication works
> refactor auth.js to use modern patterns
```

### Debug and Solve
```
> [paste error message]
> trace the issue and fix it
```

## 📖 Next Steps

1. Read `CLAUDE_MANUAL.md` for complete reference
2. Try the 10x workflow for complex changes
3. Create your own slash commands
4. Explore extended thinking for architecture decisions

---
*Remember: Claude is most powerful when you batch operations and use specific tools!*