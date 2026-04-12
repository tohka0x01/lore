"""Fix lore handler wrappers to accept (args, **kwargs) like Hermes expects."""
import re
import os

base = '/Users/proxy/Documents/program/lore/hermes-plugin/lore_hermes/__init__.py'
with open(base) as f:
    content = f.read()

# Replace each handler= line
replacements = {
    'handler=lore_status,': 'handler=lambda args, **kw: lore_status(),',
    'handler=lore_boot,': 'handler=lambda args, **kw: lore_boot(),',
    'handler=lore_get_node,': 'handler=lambda args, **kw: lore_get_node(args.get("uri"), args.get("nav_only", False), args.get("session_id")),',
    'handler=lore_create_node,': 'handler=lambda args, **kw: lore_create_node(args.get("content"), args.get("priority", 2), args.get("title"), args.get("domain", "core"), args.get("parent_path", ""), args.get("disclosure"), args.get("glossary")),',
    'handler=lore_update_node,': 'handler=lambda args, **kw: lore_update_node(args.get("uri"), args.get("content"), args.get("priority"), args.get("disclosure"), args.get("glossary")),',
    'handler=lore_delete_node,': 'handler=lambda args, **kw: lore_delete_node(args.get("uri")),',
    'handler=lore_move_node,': 'handler=lambda args, **kw: lore_move_node(args.get("old_uri"), args.get("new_uri")),',
    'handler=lore_search,': 'handler=lambda args, **kw: lore_search(args.get("query"), args.get("domain"), args.get("limit", 10)),',
    'handler=lore_recall,': 'handler=lambda args, **kw: lore_recall(args.get("query"), args.get("session_id")),',
    'handler=lore_list_domains,': 'handler=lambda args, **kw: lore_list_domains(),',
    'handler=lore_list_session_reads,': 'handler=lambda args, **kw: lore_list_session_reads(args.get("session_id")),',
    'handler=lore_clear_session_reads,': 'handler=lambda args, **kw: lore_clear_session_reads(args.get("session_id")),',
}

new_content = content
for old, new in replacements.items():
    if old in new_content:
        new_content = new_content.replace(old, new)
        print(f'Fixed: {old[:40]}...')
    else:
        print(f'NOT FOUND: {old[:40]}')

with open(base, 'w') as f:
    f.write(new_content)
print('Done!')
