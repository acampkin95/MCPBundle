#!/usr/bin/env python3
"""
Fix logForwarderStream tests to use async/await instead of done() callbacks
"""
import re
import sys

def fix_tests(content):
    # Pattern 1: Convert (done) => to async () =>
    content = re.sub(r'\(done\)\s*=>', 'async () =>', content)

    # Pattern 2: Remove standalone done(); lines
    content = re.sub(r'^\s*done\(\);\s*$', '', content, flags=re.MULTILINE)

    # Pattern 3: Convert stream.write with setTimeout+done to await writeAndWait
    # This is complex, so we'll use a multi-step approach

    # First, find all stream.write(..., () => { setTimeout(() => { ... }, N); });
    # patterns and mark them
    lines = content.split('\n')
    result_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]

        # Check if this is a stream.write line with callback
        if 'stream.write(' in line and '() =>' in line:
            # Collect the whole block
            block_lines = [line]
            brace_count = line.count('{') - line.count('}')
            j = i + 1

            while j < len(lines) and brace_count > 0:
                block_lines.append(lines[j])
                brace_count += lines[j].count('{') - lines[j].count('}')
                j += 1

            block = '\n'.join(block_lines)

            # Check if it contains setTimeout
            if 'setTimeout' in block and ('done();' in block or 'done()' in block):
                # Extract the info variable and assertions
                match = re.search(r'stream\.write\((\w+),\s*\(\)\s*=>\s*\{', block)
                if match:
                    info_var = match.group(1)

                    # Extract content inside setTimeout
                    timeout_match = re.search(r'setTimeout\(\(\)\s*=>\s*\{(.*?)\},\s*(\d+)\);', block, re.DOTALL)
                    if timeout_match:
                        assertions = timeout_match.group(1)
                        wait_ms = timeout_match.group(2)

                        # Remove done(); from assertions
                        assertions = re.sub(r'\s*done\(\);?\s*', '', assertions)
                        assertions = assertions.strip()

                        # Get indent
                        indent = re.match(r'^(\s*)', line).group(1)

                        # Build replacement
                        replacement = f'{indent}await writeAndWait({info_var}, () => {{\n{indent}  {assertions}\n{indent}}});'
                        result_lines.append(replacement)
                        i = j
                        continue

            # Not a pattern we're fixing, keep as-is
            result_lines.extend(block_lines)
            i = j
        else:
            result_lines.append(line)
            i += 1

    content = '\n'.join(result_lines)

    # Pattern 4: Fix retry test specifically (has comment)
    content = re.sub(
        r'stream\.write\(info,\s*\(\)\s*=>\s*\{\s*//\s*Give\s*time\s*for\s*retry.*?setTimeout\(\(\)\s*=>\s*\{(.*?)\},\s*1200\);.*?\}\);',
        lambda m: f'await writeAndWait(info, () => {{\n        {m.group(1).strip()}\n      }}, 1200);',
        content,
        flags=re.DOTALL
    )

    return content

if __name__ == '__main__':
    with open('tests/unit/utils/logForwarderStream.test.ts', 'r') as f:
        content = f.read()

    fixed_content = fix_tests(content)

    with open('tests/unit/utils/logForwarderStream.test.ts', 'w') as f:
        f.write(fixed_content)

    print("Fixed logForwarderStream tests")
