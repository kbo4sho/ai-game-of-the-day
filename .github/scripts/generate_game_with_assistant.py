import openai
import os
import json
from datetime import date, datetime
import shutil
import glob
import sys

# Add the scripts directory to the path so we can import test_functionality
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)

try:
    from test_functionality import validate_accessibility
    print("✅ Functionality testing module imported successfully")
except ImportError as e:
    print(f"⚠️  Warning: Could not import functionality testing module: {e}")
    print("Continuing without functionality testing...")
    
    # Create a dummy function if import fails
    def validate_accessibility(game_code, game_name):
        return {
            'score': 0,
            'max_score': 8,
            'percentage': 0,
            'passing': False,
            'issues': ['Functionality testing not available'],
            'warnings': ['Functionality testing module not found']
        }

def strip_code_blocks(code):
    """Remove markdown code blocks from the beginning and end of code"""
    # Remove leading ```javascript, ```js, or ``` markers
    lines = code.split('\n')
    if lines and lines[0].strip().startswith('```'):
        lines = lines[1:]
    # Remove trailing ``` markers
    if lines and lines[-1].strip() == '```':
        lines = lines[:-1]
    return '\n'.join(lines)

def validate_no_external_dependencies(code):
    """Check for external dependencies that could cause 403/404 errors"""
    issues = []
    warnings = []
    
    # Check for external image URLs
    import re
    image_patterns = [
        r'https?://[^\s\'"]+\.(png|jpg|jpeg|gif|svg|webp)',
        r'https?://i\.imgur\.com/[^\s\'"]+',
        r'https?://[^\s\'"]+\.imgur\.com/[^\s\'"]+',
        r'https?://cdn\.discordapp\.com/[^\s\'"]+',
        r'https?://[^\s\'"]+\.cloudinary\.com/[^\s\'"]+'
    ]
    
    for pattern in image_patterns:
        matches = re.findall(pattern, code, re.IGNORECASE)
        if matches:
            issues.append(f"External image URLs found: {len(matches)} instances")
            warnings.append(f"External images may cause 403/404 errors: {matches[:3]}...")
    
    # Check for external audio URLs
    audio_patterns = [
        r'https?://[^\s\'"]+\.(mp3|wav|ogg|m4a|aac)',
        r'https?://actions\.google\.com/sounds/[^\s\'"]+',
        r'https?://[^\s\'"]+\.freesound\.org/[^\s\'"]+'
    ]
    
    for pattern in audio_patterns:
        matches = re.findall(pattern, code, re.IGNORECASE)
        if matches:
            issues.append(f"External audio URLs found: {len(matches)} instances")
            warnings.append(f"External audio may cause 403/404 errors: {matches[:3]}...")
    
    # Check for external script dependencies
    script_patterns = [
        r'https?://[^\s\'"]+\.js',
        r'https?://cdn\.jsdelivr\.net/[^\s\'"]+',
        r'https?://unpkg\.com/[^\s\'"]+',
        r'https?://cdnjs\.cloudflare\.com/[^\s\'"]+'
    ]
    
    for pattern in script_patterns:
        matches = re.findall(pattern, code, re.IGNORECASE)
        if matches:
            issues.append(f"External script dependencies found: {len(matches)} instances")
            warnings.append(f"External scripts may cause loading issues: {matches[:3]}...")
    
    # Check for proper Web Audio API usage
    if 'AudioContext' not in code and 'webkitAudioContext' not in code:
        warnings.append("No Web Audio API usage detected - consider adding sound effects")
    
    # Check for canvas drawing methods
    canvas_methods = ['fillRect', 'strokeRect', 'arc', 'fillText', 'drawImage', 'fillStyle', 'strokeStyle']
    canvas_usage = sum(1 for method in canvas_methods if method in code)
    if canvas_usage < 3:
        warnings.append("Limited canvas drawing methods detected - consider more visual elements")
    
    return {
        'has_external_deps': len(issues) > 0,
        'issues': issues,
        'warnings': warnings,
        'canvas_methods_used': canvas_usage
    }

# Configuration variables
MODEL_NAME = "gpt-5-mini" 
THEME_OF_THE_DAY = "electricity"
ACCESSIBILITY_THRESHOLD = 60  # Minimum accessibility score required

# Load your OpenAI API key from GitHub Secrets or environment
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Read a file and include its contents in the prompt
with open('games/latest.js', 'r') as f:
    file_content = f.read()

# Step 1: Send a prompt to the Responses API
prompt = f"""You are an expert educational game designer. Each day, you will generate a fun, playable math game in JavaScript for children ages 7 to 9, focused on foundational concepts. Today's theme: {THEME_OF_THE_DAY}

The game must:
• Be engaging and fun first by having a primary visually interesting game mechanic, age-appropriate, and suitable for early learners.
• Reinforce the math concept through a real-world narratives tied to theme.
• Include fun, unique memorable characters tied to the theme.
• Use visually calming and interesting and wacky elements.
• Include sound, using the Web Audio API for correct/incorrect feedback, gentle background effects, or interactions. Use an audio context.
• Render entirely inside the existing HTML element with ID game-of-the-day-stage. You may create a canvas element inside it .
• Have a game area exactly 720px wide by 480px tall.
• Be written in clean, readable JavaScript with proper formatting, indentation, and comments.
• Use modern JavaScript practices and avoid minification.
• Include proper error handling for audio and resource loading.
• Be accessible: include keyboard controls, text alternatives, visual cues for audio, clear instructions, and error handling.
• Use ONLY canvas-drawn graphics and Web Audio API - NO external image URLs, NO external audio files, NO external dependencies.
• Create all visual elements using canvas drawing methods (rect, arc, fillText, etc.).
• Generate all sounds using Web Audio API oscillators and filters.
• Include proper error handling for audio context creation.
• Output only JavaScript code. No extra explanation, no markdown formatting, no code blocks, no HTML, no CSS.
• Do not wrap the code in ```javascript or any other markdown formatting."""

response = client.responses.create(
    model=MODEL_NAME,
    input=[{"role": "user", "content": prompt}]
)

# Step 2: Extract the assistant's reply
response_text = response.output_text

# Strip markdown code blocks if present
response_text = strip_code_blocks(response_text)

# Step 3: Test basic functionality and check for external dependencies
print("🔍 Testing basic functionality of generated game...")
accessibility_result = validate_accessibility(response_text, f"{date.today().isoformat()}.js")

print("🔍 Checking for external dependencies...")
dependency_result = validate_no_external_dependencies(response_text)

if dependency_result['has_external_deps']:
    print("❌ External dependencies detected that may cause 403/404 errors:")
    for issue in dependency_result['issues']:
        print(f"  - {issue}")
    for warning in dependency_result['warnings']:
        print(f"  - ⚠️ {warning}")
    
    # Try to fix external dependencies with a second prompt
    print("🔄 Attempting to remove external dependencies...")
    dependency_fix_prompt = f"""You are an expert educational game designer. 
Take the following JavaScript game code and remove ALL external dependencies (images, audio, scripts).
Replace external images with canvas-drawn graphics using fillRect, arc, fillText, etc.
Replace external audio with Web Audio API using oscillators and filters.
Remove any external script dependencies.

The game must:
• Use ONLY canvas-drawn graphics and Web Audio API
• Create all visual elements using canvas drawing methods (rect, arc, fillText, etc.)
• Generate all sounds using Web Audio API oscillators and filters
• Include proper error handling for audio context creation
• Render entirely inside the existing HTML element with ID game-of-the-day-stage
• Have a game area exactly 720px wide by 480px tall
• Be written in clean, readable JavaScript with proper formatting
• Output only JavaScript code - no markdown formatting, no code blocks
• Do not wrap the code in ```javascript or any other markdown formatting

---
{response_text}
---
"""

    dependency_fix_response = client.responses.create(
        model=MODEL_NAME,
        input=[{"role": "user", "content": dependency_fix_prompt}]
    )
    fixed_dependency_code = dependency_fix_response.output_text
    
    # Strip markdown code blocks from fixed code
    fixed_dependency_code = strip_code_blocks(fixed_dependency_code)
    
    # Test the fixed version
    fixed_dependency_result = validate_no_external_dependencies(fixed_dependency_code)
    
    if not fixed_dependency_result['has_external_deps']:
        print("✅ External dependencies removed successfully")
        response_text = fixed_dependency_code
        dependency_result = fixed_dependency_result
    else:
        print("⚠️  External dependencies still present after fix attempt")
        print("Proceeding with original version but logging dependency issues...")
else:
    print("✅ No external dependencies detected")

if not accessibility_result['passing']:
    print(f"❌ Game failed functionality test: {accessibility_result['percentage']:.1f}% (threshold: {ACCESSIBILITY_THRESHOLD}%)")
    print("Issues found:")
    for issue in accessibility_result['issues']:
        print(f"  - {issue}")
    print("Warnings:")
    for warning in accessibility_result['warnings']:
        print(f"  - {warning}")
    
    # Try to improve functionality with a second prompt
    print("🔄 Attempting to improve functionality...")
    functionality_improve_prompt = f"""You are an expert educational game designer. 
Take the following JavaScript game code and improve its basic functionality and playability. 
Do not change the core game mechanics or math logic.

Functionality improvements needed:
- Ensure proper game initialization (canvas, context, event listeners)
- Add proper user input handling (keyboard, mouse, or touch)
- Include a game loop or animation system
- Add basic error handling
- Include game state management (score, lives, levels, etc.)

The game must:
• Render entirely inside the existing HTML element with ID game-of-the-day-stage. You may create a canvas element inside it.
• Have a game area exactly 720px wide by 480px tall.
• Be written in clean, readable JavaScript with proper formatting, indentation, and comments.
• Use modern JavaScript practices and avoid minification.
• Include proper error handling for audio and resource loading.
• Output only JavaScript code. No extra explanation, no markdown formatting, no code blocks.
• Do not wrap the code in ```javascript or any other markdown formatting.

---
{response_text}
---
"""

    functionality_improve_response = client.responses.create(
        model=MODEL_NAME,
        input=[{"role": "user", "content": functionality_improve_prompt}]
    )
    improved_functionality_code = functionality_improve_response.output_text
    
    # Strip markdown code blocks from improved code
    improved_functionality_code = strip_code_blocks(improved_functionality_code)
    
    # Test the improved version
    improved_functionality_result = validate_accessibility(improved_functionality_code, f"{date.today().isoformat()}.js")
    
    if improved_functionality_result['passing']:
        print(f"✅ Functionality improved: {improved_functionality_result['percentage']:.1f}%")
        response_text = improved_functionality_code
        accessibility_result = improved_functionality_result
    else:
        print(f"⚠️  Functionality still below threshold: {improved_functionality_result['percentage']:.1f}%")
        print("Proceeding with original version but logging functionality issues...")
        accessibility_result = improved_functionality_result
else:
    print(f"✅ Game passed functionality test: {accessibility_result['percentage']:.1f}%")

# Step 4: Save the output to a file
today = date.today().isoformat()
os.makedirs("games", exist_ok=True)
with open(f"games/{today}.js", "w") as f:
    f.write(response_text)

# Also copy to games/latest.js
shutil.copyfile(f"games/{today}.js", "games/latest.js")

# Step 5: Create metadata
metadata = {
    "generated_date": today,
    "generated_timestamp": datetime.now().isoformat(),
    "model": MODEL_NAME,
    "theme": THEME_OF_THE_DAY,
    "prompt": prompt,
    "response_tokens": response.usage.total_tokens if hasattr(response, 'usage') else None,
    "game_filename": f"{today}.js",
    "game_size_bytes": len(response_text.encode('utf-8')),
    "functionality": {
        "score": accessibility_result['score'],
        "max_score": accessibility_result['max_score'],
        "percentage": accessibility_result['percentage'],
        "passing": accessibility_result['passing'],
        "issues": accessibility_result['issues'],
        "warnings": accessibility_result['warnings']
    },
    "dependencies": {
        "has_external_deps": dependency_result['has_external_deps'],
        "issues": dependency_result['issues'],
        "warnings": dependency_result['warnings'],
        "canvas_methods_used": dependency_result['canvas_methods_used']
    }
}

# Save JSON metadata
with open(f"games/{today}.meta.json", "w") as f:
    json.dump(metadata, f, indent=2)

# Save Markdown metadata (for human readability)
markdown_content = f"""# Game of the Day - {today}

## Metadata
- **Generated Date:** {today}
- **Generated Time:** {metadata['generated_timestamp']}
- **Model:** {metadata['model']}
- **Theme:** {metadata['theme']}
- **Game File:** {metadata['game_filename']}
- **File Size:** {metadata['game_size_bytes']} bytes
- **Tokens Used:** {metadata['response_tokens'] or 'Unknown'}

## Functionality Score
- **Score:** {accessibility_result['score']}/{accessibility_result['max_score']} ({accessibility_result['percentage']:.1f}%)
- **Status:** {'✅ PASSING' if accessibility_result['passing'] else '❌ FAILING'}

### Functionality Issues
{chr(10).join([f"- ❌ {issue}" for issue in accessibility_result['issues']]) if accessibility_result['issues'] else "- None"}

### Functionality Warnings
{chr(10).join([f"- ⚠️  {warning}" for warning in accessibility_result['warnings']]) if accessibility_result['warnings'] else "- None"}

## Dependency Analysis
- **External Dependencies:** {'❌ DETECTED' if dependency_result['has_external_deps'] else '✅ NONE'}
- **Canvas Methods Used:** {dependency_result['canvas_methods_used']}

### Dependency Issues
{chr(10).join([f"- ❌ {issue}" for issue in dependency_result['issues']]) if dependency_result['issues'] else "- None"}

### Dependency Warnings
{chr(10).join([f"- ⚠️  {warning}" for warning in dependency_result['warnings']]) if dependency_result['warnings'] else "- None"}

## Prompt Used
{prompt}

## Game Description
This game was automatically generated using OpenAI's {MODEL_NAME} model with the theme: "{THEME_OF_THE_DAY}".

## Files Generated
- `{today}.js` - The playable game
- `{today}.meta.json` - Machine-readable metadata
- `{today}.meta.md` - This human-readable documentation
"""

with open(f"games/{today}.meta.md", "w") as f:
    f.write(markdown_content)

print(f"✅ Game of the Day saved to games/{today}.js and games/latest.js")
print(f"✅ Metadata saved to games/{today}.meta.json and games/{today}.meta.md")
print(f"✅ Dependency analysis: {'❌ External deps detected' if dependency_result['has_external_deps'] else '✅ No external deps'}")

# Step 6: Improve visuals and audio with a second model call
improve_prompt = f"""You are an expert educational game designer. 
Take the following JavaScript game code and improve ONLY the visuals and audio. 
Do not change the game mechanics or math logic. 
Enhance the visual appeal (colors, animations, backgrounds, characters), avoid overstimulation with sounds and visuals, and add or improve sound effects and background audio. 
Render entirely inside the existing HTML element with ID game-of-the-day-stage. You may create a canvas element inside it (do not include angle brackets in text instructions).
Have a game area exactly 720px wide by 480px tall.
Be written in clean, readable JavaScript with proper formatting, indentation, and comments.
Use modern JavaScript practices and avoid minification.
Include proper error handling for audio and resource loading.
Use ONLY canvas-drawn graphics and Web Audio API - NO external image URLs, NO external audio files, NO external dependencies.
Create all visual elements using canvas drawing methods (rect, arc, fillText, etc.).
Generate all sounds using Web Audio API oscillators and filters.
Include proper error handling for audio context creation.
Output only JavaScript code. No extra explanation, no markdown formatting, no code blocks.
Do not wrap the code in ```javascript or any other markdown formatting.

---
{response_text}
---
"""

improve_response = client.responses.create(
    model=MODEL_NAME,
    input=[{"role": "user", "content": improve_prompt}]
)
improved_code = improve_response.output_text

# Strip markdown code blocks if present
improved_code = strip_code_blocks(improved_code)

# Ensure the improved code maintains proper formatting
print("🔧 Ensuring proper code formatting...")
formatting_prompt = f"""You are a JavaScript code formatter. 
Take the following JavaScript game code and format it with proper indentation, spacing, and readability.
Do not change any functionality, only improve the formatting.

Requirements:
- Use 2-space indentation
- Add proper spacing around operators
- Add line breaks for readability
- Keep all comments and functionality intact
- Maintain clean, readable structure
- Output ONLY the JavaScript code - no markdown formatting, no code blocks, no explanations

Output only the formatted JavaScript code. No extra explanation or formatting.

---
{improved_code}
---
"""

formatting_response = client.responses.create(
    model=MODEL_NAME,
    input=[{"role": "user", "content": formatting_prompt}]
)
formatted_code = formatting_response.output_text

# Strip markdown code blocks from formatted code as well
formatted_code = strip_code_blocks(formatted_code)

# Test functionality of the improved version
print("🔍 Testing functionality of improved game...")
improved_functionality_result = validate_accessibility(formatted_code, f"{today}.js")

# Overwrite the game file and latest.js with the improved version
with open(f"games/{today}.js", "w") as f:
    f.write(formatted_code)
shutil.copyfile(f"games/{today}.js", "games/latest.js")

# Update metadata to reflect the improvement step
metadata["improved_visuals_audio"] = True
metadata["improve_prompt"] = improve_prompt
metadata["improve_response_tokens"] = improve_response.usage.total_tokens if hasattr(improve_response, 'usage') else None
metadata["formatted_code"] = True
metadata["formatting_response_tokens"] = formatting_response.usage.total_tokens if hasattr(formatting_response, 'usage') else None
metadata["final_functionality"] = {
    "score": improved_functionality_result['score'],
    "max_score": improved_functionality_result['max_score'],
    "percentage": improved_functionality_result['percentage'],
    "passing": improved_functionality_result['passing'],
    "issues": improved_functionality_result['issues'],
    "warnings": improved_functionality_result['warnings']
}

# Save updated JSON metadata
with open(f"games/{today}.meta.json", "w") as f:
    json.dump(metadata, f, indent=2)

# Update Markdown metadata
markdown_content += f"""

---

## Visuals & Audio Improvement
A second model call was made to enhance visuals and audio.

- **Tokens Used (improvement):** {metadata['improve_response_tokens'] or 'Unknown'}

## Code Formatting
A third model call was made to ensure proper code formatting and readability.

- **Tokens Used (formatting):** {metadata['formatting_response_tokens'] or 'Unknown'}

### Final Functionality Score After Improvement
- **Score:** {improved_functionality_result['score']}/{improved_functionality_result['max_score']} ({improved_functionality_result['percentage']:.1f}%)
- **Status:** {'✅ PASSING' if improved_functionality_result['passing'] else '❌ FAILING'}

### Final Functionality Issues
{chr(10).join([f"- ❌ {issue}" for issue in improved_functionality_result['issues']]) if improved_functionality_result['issues'] else "- None"}

### Final Functionality Warnings
{chr(10).join([f"- ⚠️  {warning}" for warning in improved_functionality_result['warnings']]) if improved_functionality_result['warnings'] else "- None"}

### Prompt Used for Improvement
{improve_prompt}
"""

with open(f"games/{today}.meta.md", "w") as f:
    f.write(markdown_content)

print(f"✅ Visuals and audio improved for games/{today}.js and games/latest.js")
print(f"✅ Code formatting ensured for games/{today}.js and games/latest.js")
print(f"✅ Final functionality score: {improved_functionality_result['percentage']:.1f}%")
print(f"✅ Metadata updated for games/{today}.meta.json and games/{today}.meta.md")

# Update the index.json file
game_files = sorted(glob.glob("games/2025-*.js"))
dates = [f.split('/')[-1].replace('.js', '') for f in game_files]
with open("games/index.json", "w") as f:
    json.dump(dates, f)