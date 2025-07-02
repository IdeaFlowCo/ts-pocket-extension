#!/bin/bash
# 10x-workflow-enhanced.sh - Enhanced workflow with automatic time tracking and parallel support

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
ARTIFACTS_DIR="$HOME/Desktop/10x-artifacts"
METADATA_DIR="$HOME/.10x-workflows"
WORKTREE_BASE="$HOME/10x-worktrees"

# Create necessary directories
mkdir -p "$ARTIFACTS_DIR" "$METADATA_DIR" "$WORKTREE_BASE"

# Function to record timestamp
record_time() {
    local feature=$1
    local phase=$2
    local event=$3
    local metadata_file="$METADATA_DIR/${feature}.json"
    
    # Initialize file if doesn't exist
    if [ ! -f "$metadata_file" ]; then
        echo '{"feature":"'$feature'","times":{}}' > "$metadata_file"
    fi
    
    # Update timestamp
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local temp_file=$(mktemp)
    jq --arg phase "$phase" --arg event "$event" --arg time "$timestamp" \
        '.times[$phase + "_" + $event] = $time' "$metadata_file" > "$temp_file"
    mv "$temp_file" "$metadata_file"
}

# Function to calculate elapsed time
get_elapsed_time() {
    local start_time=$1
    local end_time=$2
    
    # Convert to seconds since epoch
    local start_sec=$(date -d "$start_time" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$start_time" +%s)
    local end_sec=$(date -d "$end_time" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$end_time" +%s)
    
    local elapsed=$((end_sec - start_sec))
    local hours=$((elapsed / 3600))
    local minutes=$(((elapsed % 3600) / 60))
    local seconds=$((elapsed % 60))
    
    printf "%02d:%02d:%02d" $hours $minutes $seconds
}

# Function to create enhanced scratchpad
create_scratchpad() {
    cat > scratchpad.md << 'EOF'
# Scratchpad: FEATURE_NAME_PLACEHOLDER
## Started: TIMESTAMP_PLACEHOLDER
## Branch: BRANCH_PLACEHOLDER
## Worktree: WORKTREE_PLACEHOLDER

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
- Discovery started: AUTO_TRACKED
- Discovery completed: AUTO_TRACKED
- Actual discovery time: AUTO_CALCULATED
- Estimated clean implementation: Y minutes

### Questions for Review
- Should we also refactor X?
- Is the pattern Y used elsewhere?

### Final Insights
- Main challenge was:
- Solution approach:
- Future considerations:
EOF
    
    # Replace placeholders
    local feature=$1
    local branch=$2
    local worktree=$3
    sed -i.bak "s/FEATURE_NAME_PLACEHOLDER/$feature/g" scratchpad.md
    sed -i.bak "s/TIMESTAMP_PLACEHOLDER/$(date)/g" scratchpad.md
    sed -i.bak "s/BRANCH_PLACEHOLDER/$branch/g" scratchpad.md
    sed -i.bak "s/WORKTREE_PLACEHOLDER/$worktree/g" scratchpad.md
    rm -f scratchpad.md.bak
}

# Function to show all workflows status
show_all_workflows() {
    echo -e "${BLUE}=== All Active 10x Workflows ===${NC}\n"
    
    # Check for active worktrees
    if command -v git &> /dev/null && git worktree list &> /dev/null; then
        echo -e "${CYAN}Git Worktrees:${NC}"
        git worktree list | while read -r line; do
            local path=$(echo "$line" | awk '{print $1}')
            local branch=$(echo "$line" | awk '{print $3}' | tr -d '[]')
            
            # Check if it's a 10x workflow
            if [[ "$path" == *"$WORKTREE_BASE"* ]] || [[ "$branch" == discovery/* ]] || [[ "$branch" == feature/* ]]; then
                echo -e "  ${GREEN}✓${NC} $path ${YELLOW}[$branch]${NC}"
                
                # Show time info if available
                local feature_name=$(echo "$branch" | sed 's/.*\///')
                if [ -f "$METADATA_DIR/${feature_name}.json" ]; then
                    local start_time=$(jq -r '.times.discovery_start // empty' "$METADATA_DIR/${feature_name}.json")
                    if [ ! -z "$start_time" ]; then
                        echo -e "    Started: $start_time"
                    fi
                fi
            fi
        done
    fi
    
    # Show metadata for all features
    echo -e "\n${CYAN}Tracked Features:${NC}"
    for metadata_file in "$METADATA_DIR"/*.json; do
        if [ -f "$metadata_file" ]; then
            local feature=$(jq -r '.feature' "$metadata_file")
            local discovery_start=$(jq -r '.times.discovery_start // empty' "$metadata_file")
            local discovery_complete=$(jq -r '.times.discovery_complete // empty' "$metadata_file")
            local implement_start=$(jq -r '.times.implementation_start // empty' "$metadata_file")
            
            echo -e "\n  ${GREEN}$feature${NC}"
            if [ ! -z "$discovery_start" ]; then
                echo -e "    Discovery started: $discovery_start"
                if [ ! -z "$discovery_complete" ]; then
                    local elapsed=$(get_elapsed_time "$discovery_start" "$discovery_complete")
                    echo -e "    Discovery completed: $discovery_complete ${YELLOW}(took $elapsed)${NC}"
                else
                    local now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
                    local elapsed=$(get_elapsed_time "$discovery_start" "$now")
                    echo -e "    Discovery in progress ${YELLOW}(elapsed: $elapsed)${NC}"
                fi
            fi
            if [ ! -z "$implement_start" ]; then
                echo -e "    Implementation started: $implement_start"
            fi
        fi
    done
}

# Function to setup worktree
setup_worktree() {
    local feature=$1
    local branch_type=$2
    local branch_name="${branch_type}/${feature}"
    local worktree_path="$WORKTREE_BASE/${feature}-${branch_type}"
    
    # Check if worktree already exists
    if [ -d "$worktree_path" ]; then
        echo -e "${YELLOW}Worktree already exists at: $worktree_path${NC}"
        echo -e "Switching to existing worktree..."
        cd "$worktree_path"
        return 0
    fi
    
    # Create worktree
    echo -e "${BLUE}Creating worktree for $branch_name...${NC}"
    git worktree add "$worktree_path" -b "$branch_name" || {
        # Branch might already exist
        git worktree add "$worktree_path" "$branch_name"
    }
    
    cd "$worktree_path"
    echo -e "${GREEN}✓ Worktree created at: $worktree_path${NC}"
}

# Check if we have required arguments
if [ $# -lt 1 ]; then
    echo -e "${RED}Usage: ./10x-workflow-enhanced.sh <feature-name> [command] [--worktree]${NC}"
    echo -e "\nCommands:"
    echo -e "  ${GREEN}start${NC}     - Start discovery phase"
    echo -e "  ${GREEN}complete${NC}  - Complete discovery and prepare for implementation"
    echo -e "  ${GREEN}implement${NC} - Start clean implementation phase"
    echo -e "  ${GREEN}status${NC}    - Show current workflow status"
    echo -e "  ${GREEN}list${NC}      - Show all active workflows"
    echo -e "\nOptions:"
    echo -e "  ${GREEN}--worktree${NC} - Use git worktrees for isolation (recommended)"
    echo -e "\nExamples:"
    echo -e "  ./10x-workflow-enhanced.sh auth-feature start --worktree"
    echo -e "  ./10x-workflow-enhanced.sh auth-feature complete"
    echo -e "  ./10x-workflow-enhanced.sh list"
    exit 1
fi

# Parse arguments
FEATURE_NAME=$1
COMMAND=${2:-start}
USE_WORKTREE=false

# Check for --worktree flag
for arg in "$@"; do
    if [ "$arg" == "--worktree" ]; then
        USE_WORKTREE=true
    fi
done

# Special case for list command
if [ "$FEATURE_NAME" == "list" ]; then
    show_all_workflows
    exit 0
fi

DISCOVERY_BRANCH="discovery/$FEATURE_NAME"
IMPLEMENTATION_BRANCH="feature/$FEATURE_NAME"
SCRATCHPAD_FILE="scratchpad.md"

# Main workflow logic
case $COMMAND in
    start)
        echo -e "${BLUE}Starting discovery phase for: ${GREEN}$FEATURE_NAME${NC}"
        
        # Record start time
        record_time "$FEATURE_NAME" "discovery" "start"
        
        if [ "$USE_WORKTREE" == true ]; then
            setup_worktree "$FEATURE_NAME" "discovery"
            create_scratchpad "$FEATURE_NAME" "$DISCOVERY_BRANCH" "$(pwd)"
        else
            # Traditional branch approach
            if git show-ref --verify --quiet refs/heads/$DISCOVERY_BRANCH; then
                echo -e "${YELLOW}Discovery branch already exists!${NC}"
                echo -e "Switch to it with: ${GREEN}git checkout $DISCOVERY_BRANCH${NC}"
                exit 1
            fi
            git checkout -b $DISCOVERY_BRANCH
            create_scratchpad "$FEATURE_NAME" "$DISCOVERY_BRANCH" "main-repo"
        fi
        
        echo -e "\n${GREEN}✓ Discovery phase initialized${NC}"
        echo -e "${GREEN}✓ Time tracking started${NC}"
        echo -e "${GREEN}✓ Scratchpad template created${NC}"
        echo -e "\n${BLUE}Instructions:${NC}"
        echo -e "1. Document EVERYTHING in ${YELLOW}$SCRATCHPAD_FILE${NC}"
        echo -e "2. Explore freely - this is your learning branch"
        echo -e "3. When done, run: ${GREEN}./10x-workflow-enhanced.sh $FEATURE_NAME complete${NC}"
        echo -e "\n${YELLOW}Time is being tracked automatically!${NC}"
        ;;
        
    complete)
        echo -e "${BLUE}Completing discovery phase for: ${GREEN}$FEATURE_NAME${NC}"
        
        # Check if scratchpad exists
        if [ ! -f "$SCRATCHPAD_FILE" ]; then
            echo -e "${RED}Error: No scratchpad.md found!${NC}"
            exit 1
        fi
        
        # Record completion time
        record_time "$FEATURE_NAME" "discovery" "complete"
        
        # Calculate elapsed time
        local metadata_file="$METADATA_DIR/${FEATURE_NAME}.json"
        local start_time=$(jq -r '.times.discovery_start' "$metadata_file")
        local end_time=$(jq -r '.times.discovery_complete' "$metadata_file")
        local elapsed=$(get_elapsed_time "$start_time" "$end_time")
        
        # Update scratchpad with time info
        sed -i.bak "s/Discovery started: AUTO_TRACKED/Discovery started: $start_time/g" scratchpad.md
        sed -i.bak "s/Discovery completed: AUTO_TRACKED/Discovery completed: $end_time/g" scratchpad.md
        sed -i.bak "s/Actual discovery time: AUTO_CALCULATED/Actual discovery time: $elapsed/g" scratchpad.md
        rm -f scratchpad.md.bak
        
        # Commit any pending changes
        if ! git diff --quiet || ! git diff --cached --quiet; then
            echo -e "${YELLOW}Committing pending changes...${NC}"
            git add -A
            git commit -m "Discovery complete: $FEATURE_NAME - took $elapsed"
        fi
        
        # Generate artifacts
        echo -e "${BLUE}Generating discovery artifacts...${NC}"
        git diff main...$DISCOVERY_BRANCH > "$ARTIFACTS_DIR/${FEATURE_NAME}_discovery.diff"
        cp $SCRATCHPAD_FILE "$ARTIFACTS_DIR/${FEATURE_NAME}_scratchpad.md"
        
        # Create enhanced learnings summary
        cat > "$ARTIFACTS_DIR/${FEATURE_NAME}_learnings.md" << EOF
# Learnings Summary: $FEATURE_NAME
Generated: $(date)

## Discovery Metrics
- Branch: $DISCOVERY_BRANCH
- Started: $start_time
- Completed: $end_time
- **Total Time: $elapsed**
- Commits: $(git rev-list --count main..HEAD 2>/dev/null || echo "N/A")
- Files changed: $(git diff --name-only main..HEAD 2>/dev/null | wc -l || echo "N/A")

## Key Insights
(Copy the most important learnings from scratchpad here)

## Implementation Checklist
Based on discovery, the clean implementation should:
- [ ] Start with...
- [ ] Avoid...
- [ ] Remember to...
- [ ] Test for...

## Time Estimates
- Discovery took: **$elapsed**
- Estimated clean implementation: ___ (update based on complexity discovered)

## Command to Start Implementation
\`\`\`bash
./10x-workflow-enhanced.sh $FEATURE_NAME implement${USE_WORKTREE:+ --worktree}
\`\`\`
EOF
        
        echo -e "\n${GREEN}✓ Discovery phase complete!${NC}"
        echo -e "${GREEN}✓ Discovery took: ${YELLOW}$elapsed${NC}"
        echo -e "\n${BLUE}Artifacts saved:${NC}"
        echo -e "  - ${YELLOW}${FEATURE_NAME}_scratchpad.md${NC}"
        echo -e "  - ${YELLOW}${FEATURE_NAME}_discovery.diff${NC}"
        echo -e "  - ${YELLOW}${FEATURE_NAME}_learnings.md${NC}"
        echo -e "\n${BLUE}Next: Review learnings and start implementation${NC}"
        ;;
        
    implement)
        echo -e "${BLUE}Starting clean implementation for: ${GREEN}$FEATURE_NAME${NC}"
        
        # Check if artifacts exist
        if [ ! -f "$ARTIFACTS_DIR/${FEATURE_NAME}_scratchpad.md" ]; then
            echo -e "${RED}Error: No discovery artifacts found!${NC}"
            echo -e "Run discovery phase first: ${GREEN}./10x-workflow-enhanced.sh $FEATURE_NAME start${NC}"
            exit 1
        fi
        
        # Record implementation start
        record_time "$FEATURE_NAME" "implementation" "start"
        
        # Get discovery time for reference
        local metadata_file="$METADATA_DIR/${FEATURE_NAME}.json"
        local discovery_start=$(jq -r '.times.discovery_start // empty' "$metadata_file")
        local discovery_complete=$(jq -r '.times.discovery_complete // empty' "$metadata_file")
        local discovery_time=""
        if [ ! -z "$discovery_start" ] && [ ! -z "$discovery_complete" ]; then
            discovery_time=$(get_elapsed_time "$discovery_start" "$discovery_complete")
        fi
        
        if [ "$USE_WORKTREE" == true ]; then
            setup_worktree "$FEATURE_NAME" "feature"
        else
            # Traditional approach
            if git show-ref --verify --quiet refs/heads/$IMPLEMENTATION_BRANCH; then
                echo -e "${YELLOW}Implementation branch already exists!${NC}"
                echo -e "Switch to it with: ${GREEN}git checkout $IMPLEMENTATION_BRANCH${NC}"
                exit 1
            fi
            git checkout main
            git checkout -b $IMPLEMENTATION_BRANCH
        fi
        
        # Copy implementation guide
        cp "$ARTIFACTS_DIR/${FEATURE_NAME}_learnings.md" "./IMPLEMENTATION_GUIDE.md"
        
        echo -e "\n${GREEN}✓ Clean implementation branch created${NC}"
        echo -e "${GREEN}✓ Implementation tracking started${NC}"
        [ ! -z "$discovery_time" ] && echo -e "${BLUE}Discovery took: ${YELLOW}$discovery_time${NC}"
        echo -e "\n${BLUE}Available references:${NC}"
        echo -e "  - ${YELLOW}IMPLEMENTATION_GUIDE.md${NC} (in current directory)"
        echo -e "  - ${YELLOW}$ARTIFACTS_DIR/${FEATURE_NAME}_scratchpad.md${NC}"
        echo -e "  - ${YELLOW}$ARTIFACTS_DIR/${FEATURE_NAME}_discovery.diff${NC}"
        echo -e "\n${BLUE}Instructions:${NC}"
        echo -e "1. Review the scratchpad and learnings"
        echo -e "2. Implement cleanly with discovered knowledge"
        echo -e "3. Track implementation time with: ${GREEN}./10x-workflow-enhanced.sh $FEATURE_NAME status${NC}"
        echo -e "\n${GREEN}Execute with precision! 🚀${NC}"
        ;;
        
    status)
        echo -e "${BLUE}=== Workflow Status: $FEATURE_NAME ===${NC}\n"
        
        # Check metadata
        local metadata_file="$METADATA_DIR/${FEATURE_NAME}.json"
        if [ ! -f "$metadata_file" ]; then
            echo -e "${RED}No workflow found for: $FEATURE_NAME${NC}"
            exit 1
        fi
        
        # Show current branch/worktree
        CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "N/A")
        echo -e "Current branch: ${YELLOW}$CURRENT_BRANCH${NC}"
        
        # Show worktrees for this feature
        if command -v git &> /dev/null && git worktree list &> /dev/null; then
            echo -e "\n${CYAN}Worktrees:${NC}"
            git worktree list | grep -E "(discovery|feature)/$FEATURE_NAME" || echo "  None"
        fi
        
        # Show time tracking
        echo -e "\n${CYAN}Time Tracking:${NC}"
        local discovery_start=$(jq -r '.times.discovery_start // empty' "$metadata_file")
        local discovery_complete=$(jq -r '.times.discovery_complete // empty' "$metadata_file")
        local implement_start=$(jq -r '.times.implementation_start // empty' "$metadata_file")
        
        if [ ! -z "$discovery_start" ]; then
            echo -e "Discovery started: $discovery_start"
            if [ ! -z "$discovery_complete" ]; then
                local elapsed=$(get_elapsed_time "$discovery_start" "$discovery_complete")
                echo -e "Discovery completed: $discovery_complete ${GREEN}(took $elapsed)${NC}"
            else
                local now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
                local elapsed=$(get_elapsed_time "$discovery_start" "$now")
                echo -e "Discovery in progress ${YELLOW}(elapsed: $elapsed)${NC}"
            fi
        fi
        
        if [ ! -z "$implement_start" ]; then
            echo -e "\nImplementation started: $implement_start"
            local now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
            local elapsed=$(get_elapsed_time "$implement_start" "$now")
            echo -e "Implementation in progress ${YELLOW}(elapsed: $elapsed)${NC}"
        fi
        
        # Show artifacts
        echo -e "\n${CYAN}Artifacts:${NC}"
        [ -f "$ARTIFACTS_DIR/${FEATURE_NAME}_scratchpad.md" ] && echo -e "  ✓ Scratchpad"
        [ -f "$ARTIFACTS_DIR/${FEATURE_NAME}_discovery.diff" ] && echo -e "  ✓ Discovery diff"
        [ -f "$ARTIFACTS_DIR/${FEATURE_NAME}_learnings.md" ] && echo -e "  ✓ Learnings summary"
        
        # Show current scratchpad preview if in discovery
        if [[ "$CURRENT_BRANCH" == "$DISCOVERY_BRANCH" ]] && [ -f "$SCRATCHPAD_FILE" ]; then
            echo -e "\n${CYAN}Scratchpad Preview:${NC}"
            head -n 15 $SCRATCHPAD_FILE | sed 's/^/  /'
            echo -e "  ${YELLOW}... (truncated)${NC}"
        fi
        ;;
        
    list)
        show_all_workflows
        ;;
        
    *)
        echo -e "${RED}Unknown command: $COMMAND${NC}"
        echo -e "Valid commands: start, complete, implement, status, list"
        exit 1
        ;;
esac