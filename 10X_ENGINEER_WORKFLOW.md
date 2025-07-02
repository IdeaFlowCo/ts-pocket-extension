# 10x Engineer Workflow: Iterative Learning with Claude Code

## Overview

This workflow transforms Claude Code into a 10x engineer by implementing an iterative, learning-based approach to complex changes. The key insight: **do the work twice** - first to learn, then to execute perfectly.

## The Process

### Phase 1: Discovery Implementation

1. **Plan with AI** (Optional)
   ```bash
   # Use Gemini or Claude to create initial plan
   # Focus on understanding the problem space
   ```

2. **Create Discovery Branch**
   ```bash
   git checkout -b discovery/feature-name
   ```

3. **Implement with Learning Mode**
   - Start `scratchpad.md` as APPEND-ONLY log
   - Document EVERYTHING:
     - Gotchas discovered
     - Judgment calls made
     - Files discovered
     - Questions that arise
     - Answers found
     - Dead ends explored
     - Assumptions validated/invalidated

4. **Commit Discovery Work**
   ```bash
   git add .
   git commit -m "Discovery: [feature name] - see scratchpad.md"
   ```

5. **Analyze and Learn**
   ```bash
   git diff main...discovery/feature-name > discovery.diff
   # Review diff with Claude Code
   # Update plan with learnings
   ```

### Phase 2: Perfect Implementation

6. **Reset to Clean State**
   ```bash
   git checkout main
   git checkout -b feature/feature-name
   ```

7. **Execute with Perfect Knowledge**
   - Provide Claude Code with:
     - Updated plan
     - Complete scratchpad.md
     - Key learnings from discovery
   - Implement cleanly without exploration overhead
   - Avoid all discovered pitfalls
   - Make optimal decisions from the start

8. **Commit Clean Implementation**
   ```bash
   git add .
   git commit -m "Implement [feature name]"
   ```

## Scratchpad Template

```markdown
# Scratchpad: [Feature Name]
## Started: [timestamp]

### Initial Understanding
- What I think needs to be done:
- Key files I expect to modify:

### Discovery Log

#### [timestamp] - Found entry point
- Located main functionality in `file.js:123`
- Need to understand how X connects to Y

#### [timestamp] - Gotcha #1
- Assumed X but actually Y because...
- This changes the approach for...

#### [timestamp] - Question
- How does the authentication flow handle...?

#### [timestamp] - Answer found
- Authentication uses... (see `auth.js:45`)
- This means we need to...

#### [timestamp] - Judgment call
- Choosing approach A over B because...
- Trade-offs considered:

#### [timestamp] - Dead end
- Tried modifying X directly
- Doesn't work because of dependency on Y
- Better approach: modify Z instead

### Files Discovered
- `unexpected-file.js` - Contains critical logic for...
- `config.js:89` - Hidden configuration that affects...

### Key Learnings
1. The system actually works by...
2. Must account for edge case when...
3. Performance consideration: avoid...
4. The clean approach is to...

### Questions for Round 2
- Should we refactor X while we're here?
- Is the error handling pattern consistent?

### Final Insights
- Total time spent exploring: X hours
- Estimated time for clean implementation: Y minutes
- Key risks identified and mitigated
```

## Benefits of This Approach

### 1. **Eliminates Exploration Overhead**
- Discovery branch contains all the messy exploration
- Final implementation is clean and direct
- No commented-out code or failed attempts

### 2. **Perfect Decision Making**
- Every judgment call informed by complete knowledge
- No backtracking or refactoring mid-implementation
- Optimal architecture choices from the start

### 3. **Comprehensive Understanding**
- Scratchpad captures entire learning journey
- Future developers understand the "why"
- Invaluable for onboarding and maintenance

### 4. **Risk Mitigation**
- All gotchas discovered in safe environment
- Edge cases identified before final implementation
- No surprises during code review

### 5. **10x Speed on Complex Changes**
- Discovery: 2-4 hours of exploration
- Implementation: 20-30 minutes of perfect execution
- Total: Higher quality in less total time

## Example Workflow Script

```bash
#!/bin/bash
# 10x-workflow.sh

FEATURE_NAME=$1
BRANCH_TYPE=${2:-discovery}

if [ "$BRANCH_TYPE" == "discovery" ]; then
    echo "Starting discovery phase for: $FEATURE_NAME"
    git checkout -b discovery/$FEATURE_NAME
    
    # Create scratchpad
    cat > scratchpad.md << EOF
# Scratchpad: $FEATURE_NAME
## Started: $(date)

### Initial Understanding

### Discovery Log

### Files Discovered

### Key Learnings

### Questions for Round 2

### Final Insights
EOF
    
    echo "Discovery branch created. Start exploring!"
    echo "Remember: Document EVERYTHING in scratchpad.md"
    
elif [ "$BRANCH_TYPE" == "implement" ]; then
    echo "Starting implementation phase for: $FEATURE_NAME"
    
    # Save scratchpad and diff
    cp scratchpad.md ~/Desktop/${FEATURE_NAME}_scratchpad.md
    git diff main...HEAD > ~/Desktop/${FEATURE_NAME}_discovery.diff
    
    # Create clean implementation branch
    git checkout main
    git checkout -b feature/$FEATURE_NAME
    
    echo "Clean branch created."
    echo "Scratchpad saved to: ~/Desktop/${FEATURE_NAME}_scratchpad.md"
    echo "Discovery diff saved to: ~/Desktop/${FEATURE_NAME}_discovery.diff"
    echo "Now implement with perfect knowledge!"
fi
```

## Real-World Example

### Discovery Phase Output
```markdown
#### 09:45 - Started implementing Gemini integration
- Expected: Add gemini-service.js and wire up
- Reality: Need to refactor message passing first

#### 10:15 - Gotcha #1: Message size limits
- Chrome has 64MB limit for messages
- Large articles break when sending to service worker
- Solution: Implement chunking or compress

#### 10:30 - Found unexpected dependency
- content.js relies on implicit globals
- Must refactor before adding Gemini calls
- This wasn't obvious from file structure

#### 11:00 - Performance issue discovered
- Synchronous content extraction blocks UI
- Need to make async without breaking popup
```

### Implementation Phase (Round 2)
With the complete scratchpad, the second implementation:
- Starts with async refactor
- Implements chunking from the beginning  
- Handles globals properly
- Takes 30 minutes instead of 3 hours
- Zero backtracking or refactoring

## Tips for Maximum Effectiveness

1. **Be Verbose in Discovery**
   - Write down every thought
   - Document why you're checking each file
   - Record all assumptions

2. **Don't Fix in Discovery**
   - Just understand and document
   - Resist the urge to clean up
   - Focus on learning

3. **Analyze Thoroughly**
   - Review the diff carefully
   - Identify patterns in the gotchas
   - Update architectural understanding

4. **Trust the Process**
   - The messier the discovery, the cleaner the implementation
   - Time "wasted" exploring saves 10x in implementation
   - Perfect is faster than good enough + fixes

## Conclusion

This workflow transforms complex, uncertain changes into predictable, high-quality implementations. By separating learning from execution, we achieve both deep understanding and clean code - the hallmark of a 10x engineer.