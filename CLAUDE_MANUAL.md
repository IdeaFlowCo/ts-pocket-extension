# Claude Manual - Complete Tool Directory & Reference Guide

## Table of Contents
1. [Quick Start](#quick-start)
2. [Core Tools Reference](#core-tools-reference)
3. [Command Line Options](#command-line-options)
4. [Workflow Examples](#workflow-examples)
5. [Advanced Techniques](#advanced-techniques)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Basic Usage
```bash
# Start interactive session
claude

# Non-interactive mode
claude --print "your prompt here"

# Continue previous conversation
claude --continue

# Resume with conversation picker
claude --resume
```

### Essential Commands
| Command | Description | Example |
|---------|-------------|---------|
| `@file` | Reference files | `@src/main.js` |
| `/help` | Get help | `/help` |
| `/project:cmd` | Project commands | `/project:test` |
| `/user:cmd` | Personal commands | `/user:review` |

---

## Core Tools Reference

### 1. **Task** - Autonomous Agent
Search and exploration tool for complex file/keyword searches.
```
Usage: Best for open-ended searches, finding patterns across codebases
When: Use when searching for concepts, not specific file paths
```

### 2. **Bash** - Command Execution
Execute shell commands with timeout support.
```bash
# Examples:
npm test
git status
python script.py
```
**Important**: Always quote paths with spaces. Max timeout: 600000ms (10 min)

### 3. **Glob** - File Pattern Matching
Fast file search by name patterns.
```
Pattern examples:
- **/*.js       # All JS files
- src/**/*.ts   # TypeScript in src
- **/test/*     # All test directories
```

### 4. **Grep** - Content Search
Search file contents with regex.
```
Pattern examples:
- TODO|FIXME           # Find todos
- function\s+\w+       # Find functions
- import.*from.*react  # React imports
```

### 5. **Read** - File Reader
Read files with line numbers. Supports images.
```
Features:
- Line numbers included
- 2000 line default limit
- Image visualization
- Offset/limit for large files
```

### 6. **Edit** - String Replacement
Exact string replacement in files.
```
Requirements:
- Must Read file first
- Exact match required
- Preserves indentation
- Use replace_all for multiple
```

### 7. **MultiEdit** - Batch Edits
Multiple edits in one operation.
```
Benefits:
- Sequential application
- Atomic operations
- Efficient for many changes
```

### 8. **Write** - File Creation
Create or overwrite files.
```
Rules:
- Overwrites existing files
- Must Read before overwriting
- Prefer Edit for existing files
```

### 9. **TodoRead/TodoWrite** - Task Management
Track and manage coding tasks.
```
States: pending → in_progress → completed
Priority: high, medium, low
Usage: Complex multi-step tasks
```

### 10. **WebSearch** - Internet Search
Search the web for current information.
```
Features:
- US only
- Domain filtering
- Recent data access
```

### 11. **WebFetch** - URL Content
Fetch and analyze web content.
```
Process:
1. Fetches URL
2. Converts to markdown
3. AI analysis with prompt
```

### 12. **NotebookRead/Edit** - Jupyter Support
Work with Jupyter notebooks.
```
Features:
- Cell-by-cell access
- Code/markdown cells
- Output preservation
```

---

## Command Line Options

### Starting Claude
```bash
claude [options] [prompt]

Options:
  --continue          Resume most recent conversation
  --resume            Show conversation picker
  --print             Non-interactive mode
  --output-format     Set output format (text|json|stream-json)
  --no-cache          Disable response caching
  --model             Specify model version
```

### Output Formats
```bash
# Plain text (default)
claude --print "prompt" --output-format text

# JSON with metadata
claude --print "prompt" --output-format json

# Streaming JSON
claude --print "prompt" --output-format stream-json
```

---

## Workflow Examples

### 1. **10x Engineer Workflow**
Two-phase approach: Discovery → Implementation

```bash
# Phase 1: Discovery
./10x-workflow.sh feature-name start
# Explore and document in scratchpad.md
./10x-workflow.sh feature-name complete

# Phase 2: Clean Implementation  
./10x-workflow.sh feature-name implement
# Execute with perfect knowledge
```

### 2. **Parallel Development with Git Worktrees**
```bash
# Create worktree for feature A
git worktree add ../project-feature-a -b feature-a
cd ../project-feature-a
claude

# Simultaneously in another terminal
git worktree add ../project-feature-b -b feature-b
cd ../project-feature-b
claude

# List all worktrees
git worktree list

# Remove when done
git worktree remove ../project-feature-a
```

### 3. **Code Review Workflow**
```bash
# Create review command
echo "Review this code for security, performance, and best practices:" > ~/.claude/commands/review.md

# Use in any project
claude
> @src/api.js
> /user:review
```

### 4. **Debugging Workflow**
```bash
# Share error
> Here's the error: [paste error]

# Get stack trace
> run the failing command with verbose output

# Find root cause
> trace through the stack to find the issue

# Apply fix
> fix the issue in auth.js line 45
```

### 5. **Documentation Generation**
```bash
# Find undocumented code
> find functions without documentation in src/

# Generate docs
> add JSDoc comments to all public methods

# Create README
> generate a README based on the codebase structure
```

---

## Advanced Techniques

### 1. **Batch Operations**
```bash
# Multiple file reads
> read @file1.js @file2.js @file3.js

# Parallel searches
> find all TODO comments and search for deprecated APIs

# Bulk refactoring
> update all imports from './old' to './new' across the codebase
```

### 2. **Extended Thinking**
```bash
# Basic thinking
> think about the best approach for this refactor

# Deep thinking
> think harder about potential security vulnerabilities

# Intense analysis
> think deeply about the performance implications
```

### 3. **Context Management**
```bash
# Reference with context
> explain how @src/auth.js relates to @src/api.js

# Directory overview
> what's the purpose of @src/components/?

# Pattern analysis
> analyze the coding patterns in @src/**/*.js
```

### 4. **Custom Slash Commands**
```bash
# Project commands
mkdir -p .claude/commands
echo "Run tests and fix any failures:" > .claude/commands/test-fix.md

# Personal commands  
mkdir -p ~/.claude/commands
echo "Analyze for performance bottlenecks:" > ~/.claude/commands/perf.md

# With arguments
echo "Translate to $ARGUMENTS:" > .claude/commands/translate.md
# Usage: /project:translate Spanish
```

### 5. **Image Analysis**
```bash
# Drag & drop image or:
> analyze the screenshot at /path/to/error.png

# UI analysis
> recreate this design [paste image]

# Diagram understanding
> explain this architecture diagram
```

---

## Best Practices

### 1. **File Operations**
- Always Read before Edit/Write
- Use MultiEdit for multiple changes
- Prefer editing existing files
- Quote paths with spaces

### 2. **Search Strategy**
- Start broad, narrow down
- Use Task for complex searches
- Batch related searches
- Combine Glob and Grep

### 3. **Task Management**
- Use TodoWrite for 3+ steps
- One task in_progress at a time
- Update status immediately
- Document blockers

### 4. **Performance**
- Batch tool calls when possible
- Use appropriate tools (not Task for simple reads)
- Leverage caching with --continue
- Clean up large outputs

### 5. **Documentation**
- Create .claude/commands for team
- Use CLAUDE.md for project context
- Document architectural decisions
- Keep scratchpads for complex work

---

## Troubleshooting

### Common Issues

**1. Tool Blocked by Hook**
```
Solution: Check hooks configuration
Command: Review .claude/hooks or settings
```

**2. Large File Handling**
```
Solution: Use offset/limit parameters
Example: Read file with limit=1000 offset=5000
```

**3. Authentication Errors**
```
Solution: Re-authenticate or check tokens
Debug: Enable debug mode in settings
```

**4. Slow Performance**
```
Solutions:
- Use more specific searches
- Batch operations
- Reduce file reads
- Use --no-cache if needed
```

**5. Git Conflicts**
```
Solution: Use worktrees for isolation
Command: git worktree add ../feature
```

### Debug Mode
```bash
# Enable via settings or:
export CLAUDE_DEBUG=true
claude

# View logs
claude --show-logs
```

### Getting Help
- `/help` - In-session help
- Report issues: https://github.com/anthropics/claude-code/issues
- Docs: https://docs.anthropic.com/en/docs/claude-code

---

## Quick Reference Card

### Essential Shortcuts
```
@file           - Include file content
@dir/           - Show directory listing  
/help          - Get help
Ctrl+C         - Cancel operation
Ctrl+D         - Exit session
```

### Tool Selection Guide
| Need | Use |
|------|-----|
| Find files by name | Glob |
| Search in files | Grep |
| Complex search | Task |
| Read specific file | Read |
| Run commands | Bash |
| Change files | Edit/MultiEdit |
| Track progress | TodoWrite |
| Web info | WebSearch |

### Performance Tips
1. Batch similar operations
2. Use specific tools, not Task
3. Reference files with @
4. Use worktrees for parallel work
5. Cache with --continue

---

_Last updated for Claude Code v1.0_