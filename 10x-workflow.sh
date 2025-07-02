#!/bin/bash
# 10x-workflow.sh - Automated workflow for iterative development with Claude Code

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we have required arguments
if [ $# -lt 1 ]; then
    echo -e "${RED}Usage: ./10x-workflow.sh <feature-name> [command]${NC}"
    echo -e "Commands:"
    echo -e "  ${GREEN}start${NC}    - Start discovery phase (default)"
    echo -e "  ${GREEN}complete${NC} - Complete discovery and prepare for implementation"
    echo -e "  ${GREEN}implement${NC} - Start clean implementation phase"
    echo -e "  ${GREEN}status${NC}   - Show current workflow status"
    exit 1
fi

FEATURE_NAME=$1
COMMAND=${2:-start}
DISCOVERY_BRANCH="discovery/$FEATURE_NAME"
IMPLEMENTATION_BRANCH="feature/$FEATURE_NAME"
SCRATCHPAD_FILE="scratchpad.md"
ARTIFACTS_DIR="$HOME/Desktop/10x-artifacts"

# Create artifacts directory if it doesn't exist
mkdir -p "$ARTIFACTS_DIR"

# Function to create scratchpad template
create_scratchpad() {
    cat > $SCRATCHPAD_FILE << 'EOF'
# Scratchpad: FEATURE_NAME_PLACEHOLDER
## Started: TIMESTAMP_PLACEHOLDER

### Initial Understanding
- What I think needs to be done:
- Key files I expect to modify:
- Estimated complexity: 

### Discovery Log

#### [timestamp] - Initial exploration
- Starting point:
- First file examined:

#### [timestamp] - Example gotcha entry
- What I expected:
- What I found:
- Impact on approach:

### Files Discovered
- `file.js` - Purpose and why it matters

### Architecture Insights
- How the system actually works:
- Hidden dependencies:
- Unexpected interactions:

### Gotchas & Pitfalls
1. **Gotcha #1**: Description and workaround
2. **Gotcha #2**: Description and workaround

### Judgment Calls
1. **Decision**: Chose X over Y because...
2. **Trade-off**: Accepted A to gain B

### Questions Answered
- Q: How does X work?
  A: It works by...

### Dead Ends Explored
- Tried approach X - failed because Y
- Better approach discovered: Z

### Performance Considerations
- Bottleneck found in:
- Optimization opportunity:

### Security Considerations
- Potential issue:
- Mitigation:

### Key Learnings
1. The most important insight:
2. What I wish I knew at the start:
3. The optimal approach is:

### Implementation Plan (Refined)
1. First, do X because of learning Y
2. Then handle Z before A (discovered dependency)
3. Finally, implement B with consideration for C

### Time Analysis
- Discovery time: X hours
- Estimated clean implementation: Y minutes
- Complexity reduced from: HIGH to MEDIUM

### Questions for Review
- Should we also refactor X?
- Is the pattern Y used elsewhere?

### Final Insights
- Main challenge was:
- Solution approach:
- Future considerations:
EOF
    
    # Replace placeholders
    sed -i.bak "s/FEATURE_NAME_PLACEHOLDER/$FEATURE_NAME/g" $SCRATCHPAD_FILE
    sed -i.bak "s/TIMESTAMP_PLACEHOLDER/$(date)/g" $SCRATCHPAD_FILE
    rm -f ${SCRATCHPAD_FILE}.bak
}

# Function to show status
show_status() {
    echo -e "${BLUE}=== 10x Workflow Status ===${NC}"
    echo -e "Feature: ${GREEN}$FEATURE_NAME${NC}"
    
    # Check current branch
    CURRENT_BRANCH=$(git branch --show-current)
    echo -e "Current branch: ${YELLOW}$CURRENT_BRANCH${NC}"
    
    # Check if branches exist
    if git show-ref --verify --quiet refs/heads/$DISCOVERY_BRANCH; then
        echo -e "Discovery branch: ${GREEN}✓ Exists${NC}"
        
        # Show scratchpad preview if on discovery branch
        if [ "$CURRENT_BRANCH" = "$DISCOVERY_BRANCH" ] && [ -f "$SCRATCHPAD_FILE" ]; then
            echo -e "\n${BLUE}Scratchpad Preview:${NC}"
            head -n 20 $SCRATCHPAD_FILE | sed 's/^/  /'
            echo -e "  ${YELLOW}... (truncated)${NC}"
        fi
    else
        echo -e "Discovery branch: ${RED}✗ Not started${NC}"
    fi
    
    if git show-ref --verify --quiet refs/heads/$IMPLEMENTATION_BRANCH; then
        echo -e "Implementation branch: ${GREEN}✓ Exists${NC}"
    else
        echo -e "Implementation branch: ${YELLOW}⧖ Pending${NC}"
    fi
    
    # Check for saved artifacts
    if [ -f "$ARTIFACTS_DIR/${FEATURE_NAME}_scratchpad.md" ]; then
        echo -e "\n${BLUE}Saved Artifacts:${NC}"
        echo -e "  - Scratchpad: $ARTIFACTS_DIR/${FEATURE_NAME}_scratchpad.md"
        if [ -f "$ARTIFACTS_DIR/${FEATURE_NAME}_discovery.diff" ]; then
            echo -e "  - Discovery diff: $ARTIFACTS_DIR/${FEATURE_NAME}_discovery.diff"
        fi
        if [ -f "$ARTIFACTS_DIR/${FEATURE_NAME}_learnings.md" ]; then
            echo -e "  - Learnings: $ARTIFACTS_DIR/${FEATURE_NAME}_learnings.md"
        fi
    fi
}

# Main workflow logic
case $COMMAND in
    start)
        echo -e "${BLUE}Starting discovery phase for: ${GREEN}$FEATURE_NAME${NC}"
        
        # Check if discovery branch already exists
        if git show-ref --verify --quiet refs/heads/$DISCOVERY_BRANCH; then
            echo -e "${YELLOW}Discovery branch already exists!${NC}"
            echo -e "Switch to it with: ${GREEN}git checkout $DISCOVERY_BRANCH${NC}"
            exit 1
        fi
        
        # Create and switch to discovery branch
        git checkout -b $DISCOVERY_BRANCH
        
        # Create scratchpad
        create_scratchpad
        
        echo -e "\n${GREEN}✓ Discovery branch created${NC}"
        echo -e "${GREEN}✓ Scratchpad template created${NC}"
        echo -e "\n${BLUE}Instructions:${NC}"
        echo -e "1. Document EVERYTHING in ${YELLOW}$SCRATCHPAD_FILE${NC}"
        echo -e "2. Explore freely - this is your learning branch"
        echo -e "3. When done, run: ${GREEN}./10x-workflow.sh $FEATURE_NAME complete${NC}"
        echo -e "\n${YELLOW}Remember: The messier the discovery, the cleaner the implementation!${NC}"
        ;;
        
    complete)
        echo -e "${BLUE}Completing discovery phase for: ${GREEN}$FEATURE_NAME${NC}"
        
        # Check if we're on discovery branch
        CURRENT_BRANCH=$(git branch --show-current)
        if [ "$CURRENT_BRANCH" != "$DISCOVERY_BRANCH" ]; then
            echo -e "${RED}Error: Not on discovery branch!${NC}"
            echo -e "Switch to it with: ${GREEN}git checkout $DISCOVERY_BRANCH${NC}"
            exit 1
        fi
        
        # Check if scratchpad exists
        if [ ! -f "$SCRATCHPAD_FILE" ]; then
            echo -e "${RED}Error: No scratchpad.md found!${NC}"
            exit 1
        fi
        
        # Commit any pending changes
        if ! git diff --quiet || ! git diff --cached --quiet; then
            echo -e "${YELLOW}Committing pending changes...${NC}"
            git add -A
            git commit -m "Discovery complete: $FEATURE_NAME - see scratchpad.md"
        fi
        
        # Generate discovery diff
        echo -e "${BLUE}Generating discovery diff...${NC}"
        git diff main...$DISCOVERY_BRANCH > "$ARTIFACTS_DIR/${FEATURE_NAME}_discovery.diff"
        
        # Copy scratchpad
        cp $SCRATCHPAD_FILE "$ARTIFACTS_DIR/${FEATURE_NAME}_scratchpad.md"
        
        # Create learnings summary
        cat > "$ARTIFACTS_DIR/${FEATURE_NAME}_learnings.md" << EOF
# Learnings Summary: $FEATURE_NAME
Generated: $(date)

## Discovery Branch
- Branch: $DISCOVERY_BRANCH
- Commits: $(git rev-list --count main..$DISCOVERY_BRANCH)
- Files changed: $(git diff --name-only main..$DISCOVERY_BRANCH | wc -l)

## Key Insights
(Copy the most important learnings from scratchpad here)

## Implementation Checklist
Based on discovery, the clean implementation should:
- [ ] Start with...
- [ ] Avoid...
- [ ] Remember to...
- [ ] Test for...

## Estimated Time
- Discovery took: ___
- Clean implementation should take: ___

## Command to Start Implementation
\`\`\`bash
./10x-workflow.sh $FEATURE_NAME implement
\`\`\`
EOF
        
        echo -e "\n${GREEN}✓ Discovery phase complete!${NC}"
        echo -e "\n${BLUE}Artifacts saved to: ${ARTIFACTS_DIR}${NC}"
        echo -e "  - ${YELLOW}${FEATURE_NAME}_scratchpad.md${NC} - Full discovery log"
        echo -e "  - ${YELLOW}${FEATURE_NAME}_discovery.diff${NC} - All changes made"
        echo -e "  - ${YELLOW}${FEATURE_NAME}_learnings.md${NC} - Summary template"
        echo -e "\n${BLUE}Next steps:${NC}"
        echo -e "1. Review the diff and scratchpad"
        echo -e "2. Update the learnings summary"
        echo -e "3. Run: ${GREEN}./10x-workflow.sh $FEATURE_NAME implement${NC}"
        ;;
        
    implement)
        echo -e "${BLUE}Starting clean implementation for: ${GREEN}$FEATURE_NAME${NC}"
        
        # Check if artifacts exist
        if [ ! -f "$ARTIFACTS_DIR/${FEATURE_NAME}_scratchpad.md" ]; then
            echo -e "${RED}Error: No discovery artifacts found!${NC}"
            echo -e "Run discovery phase first: ${GREEN}./10x-workflow.sh $FEATURE_NAME start${NC}"
            exit 1
        fi
        
        # Check if implementation branch already exists
        if git show-ref --verify --quiet refs/heads/$IMPLEMENTATION_BRANCH; then
            echo -e "${YELLOW}Implementation branch already exists!${NC}"
            echo -e "Switch to it with: ${GREEN}git checkout $IMPLEMENTATION_BRANCH${NC}"
            exit 1
        fi
        
        # Switch to main and create implementation branch
        git checkout main
        git checkout -b $IMPLEMENTATION_BRANCH
        
        # Copy learnings to current directory for reference
        cp "$ARTIFACTS_DIR/${FEATURE_NAME}_learnings.md" "./IMPLEMENTATION_GUIDE.md"
        
        echo -e "\n${GREEN}✓ Clean implementation branch created${NC}"
        echo -e "${GREEN}✓ Implementation guide copied${NC}"
        echo -e "\n${BLUE}Available references:${NC}"
        echo -e "  - ${YELLOW}IMPLEMENTATION_GUIDE.md${NC} - Learnings summary (in current dir)"
        echo -e "  - ${YELLOW}$ARTIFACTS_DIR/${FEATURE_NAME}_scratchpad.md${NC} - Full discovery log"
        echo -e "  - ${YELLOW}$ARTIFACTS_DIR/${FEATURE_NAME}_discovery.diff${NC} - Discovery changes"
        echo -e "\n${BLUE}Instructions:${NC}"
        echo -e "1. Open the scratchpad and learnings in your editor"
        echo -e "2. Implement cleanly using the discovered knowledge"
        echo -e "3. No exploration needed - execute with precision!"
        echo -e "\n${GREEN}Happy coding! You're now a 10x engineer! 🚀${NC}"
        ;;
        
    status)
        show_status
        ;;
        
    *)
        echo -e "${RED}Unknown command: $COMMAND${NC}"
        echo -e "Valid commands: start, complete, implement, status"
        exit 1
        ;;
esac