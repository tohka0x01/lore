import re
import json
import os

base_dir = '/Users/proxy/Documents/program/lore/hermes-plugin'
with open(os.path.join(base_dir, 'lore_hermes/__init__.py'), 'r') as f:
    content = f.read()

tools_data = {
    "lore_status": {
        "props": {},
        "required": [],
        "desc": "Check Lore memory backend availability and connection health"
    },
    "lore_boot": {
        "props": {},
        "required": [],
        "desc": "Load the boot memory view that restores long-term identity and core operating context"
    },
    "lore_get_node": {
        "props": {
            "uri": {"type": "string", "description": "Memory URI (e.g., 'core://identity', 'project://myapp/arch')"},
            "nav_only": {"type": "boolean", "description": "If true, return only navigation info without full content"},
            "session_id": {"type": "string", "description": "Optional session ID for read tracking"}
        },
        "required": ["uri"],
        "desc": "Read a memory node by its URI"
    },
    "lore_create_node": {
        "props": {
            "content": {"type": "string", "description": "Memory content"},
            "priority": {"type": "integer", "description": "Priority level (0=core, 1=important, 2+=normal)"},
            "title": {"type": "string", "description": "Node title (optional)"},
            "domain": {"type": "string", "description": "Memory domain"},
            "parent_path": {"type": "string", "description": "Parent path within domain"},
            "disclosure": {"type": "string", "description": "When to disclose this memory"},
            "glossary": {"type": "array", "items": {"type": "string"}, "description": "Keywords for indexing"}
        },
        "required": ["content"],
        "desc": "Create a new memory node"
    },
    "lore_update_node": {
        "props": {
            "uri": {"type": "string", "description": "Memory URI to update"},
            "content": {"type": "string", "description": "New content (optional)"},
            "priority": {"type": "integer", "description": "New priority (optional)"},
            "disclosure": {"type": "string", "description": "New disclosure (optional)"},
            "glossary": {"type": "array", "items": {"type": "string"}, "description": "New glossary (optional)"}
        },
        "required": ["uri"],
        "desc": "Update an existing memory node"
    },
    "lore_delete_node": {
        "props": {
            "uri": {"type": "string", "description": "Memory URI to delete"}
        },
        "required": ["uri"],
        "desc": "Delete a memory node"
    },
    "lore_move_node": {
        "props": {
            "old_uri": {"type": "string", "description": "Source URI"},
            "new_uri": {"type": "string", "description": "Destination URI"}
        },
        "required": ["old_uri", "new_uri"],
        "desc": "Move or rename a memory node"
    },
    "lore_search": {
        "props": {
            "query": {"type": "string", "description": "Search query"},
            "domain": {"type": "string", "description": "Optional domain filter"},
            "limit": {"type": "integer", "description": "Max results"}
        },
        "required": ["query"],
        "desc": "Search memories using keyword search"
    },
    "lore_recall": {
        "props": {
            "query": {"type": "string", "description": "Query for semantic recall"},
            "session_id": {"type": "string", "description": "Optional session ID"}
        },
        "required": ["query"],
        "desc": "Perform semantic recall to find relevant memories"
    },
    "lore_list_domains": {
        "props": {},
        "required": [],
        "desc": "List all available memory domains"
    },
    "lore_list_session_reads": {
        "props": {
            "session_id": {"type": "string", "description": "Session ID"}
        },
        "required": ["session_id"],
        "desc": "Show which memory nodes have been read in this session"
    },
    "lore_clear_session_reads": {
        "props": {
            "session_id": {"type": "string", "description": "Session ID"}
        },
        "required": ["session_id"],
        "desc": "Clear the session read tracking list"
    }
}

def parse_schema_brace(block_str, schema_start):
    """Find schema dict in block using brace counting"""
    # schema={ is at schema_start
    brace_start = block_str.find('{', schema_start)
    depth = 0
    i = brace_start
    while i < len(block_str):
        if block_str[i] == '{':
            depth += 1
        elif block_str[i] == '}':
            depth -= 1
            if depth == 0:
                return block_str[brace_start:i+1], i+1
        i += 1
    return None, -1

def fix_file(content):
    new_content = content
    for tool_name, data in tools_data.items():
        # Find ctx.register_tool calls for this tool
        search = 'ctx.register_tool(\n        name="' + tool_name + '"'
        if search not in new_content:
            search = 'ctx.register_tool(\n    name="' + tool_name + '"'
        
        if search not in new_content:
            print(f'WARNING: {tool_name} not found with standard search')
            continue
        
        idx = new_content.find(search)
        
        # Find the schema={ in this block
        schema_start = new_content.find('schema={', idx)
        if schema_start == -1 or schema_start > idx + 500:
            print(f'WARNING: schema not found for {tool_name}')
            continue
        
        # Extract old schema using brace counting
        brace_start = new_content.find('{', schema_start + 7)
        depth = 0
        i = brace_start
        while i < len(new_content):
            if new_content[i] == '{':
                depth += 1
            elif new_content[i] == '}':
                depth -= 1
                if depth == 0:
                    old_schema = new_content[brace_start:i+1]
                    break
            i += 1
        else:
            print(f'WARNING: Could not find end of schema for {tool_name}')
            continue
        
        # Build new schema
        params = {
            "type": "object",
            "properties": data["props"],
            "required": data["required"]
        }
        params_json = json.dumps(params, indent=" " * 16)
        # Indent each line of params_json by 16 spaces
        params_indented = '\n'.join('                ' + line for line in params_json.split('\n'))
        new_schema = '{\n            "name": "' + tool_name + '",\n            "description": "' + data["desc"] + '",\n            "parameters": ' + params_indented + '\n        }'
        
        # Replace
        old_block = 'schema=' + old_schema
        new_block = 'schema=' + new_schema
        
        if old_block in new_content:
            new_content = new_content.replace(old_block, new_block, 1)
            print(f'Fixed: {tool_name}')
        else:
            print(f'WARNING: old schema block not found for {tool_name}')
    
    return new_content

new_content = fix_file(content)

with open(os.path.join(base_dir, 'lore_hermes/__init__.py'), 'w') as f:
    f.write(new_content)
print('\nDone!')