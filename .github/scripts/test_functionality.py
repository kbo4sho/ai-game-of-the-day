import os
import json
import glob

def validate_accessibility(game_code, game_name):
    """Validate the generated game code for basic functionality and playability"""
    functionality_issues = []
    functionality_warnings = []
    functionality_score = 0
    max_score = 12  # Expanded scoring system
    
    print(f"\n🔍 Validating basic functionality for {game_name}...")
    
    # 1. Game Initialization (2 points)
    init_patterns = ['canvas', 'getContext', 'requestAnimationFrame', 'addEventListener']
    init_found = any(pattern in game_code.lower() for pattern in init_patterns)
    if init_found:
        functionality_score += 2
        print(f"✅ Game initialization detected")
    else:
        functionality_issues.append("No game initialization found")
        print(f"❌ No game initialization found")
    
    # 2. User Input Handling (2 points)
    input_patterns = ['keydown', 'keyup', 'keypress', 'click', 'mousedown', 'mouseup', 'touchstart']
    input_found = any(pattern in game_code.lower() for pattern in input_patterns)
    if input_found:
        functionality_score += 2
        print(f"✅ User input handling detected")
    else:
        functionality_issues.append("No user input handling found")
        print(f"❌ No user input handling found")
    
    # 3. Game Loop/Animation (2 points)
    loop_patterns = ['requestAnimationFrame', 'setInterval', 'setTimeout', 'update', 'draw']
    loop_found = any(pattern in game_code.lower() for pattern in loop_patterns)
    if loop_found:
        functionality_score += 2
        print(f"✅ Game loop/animation detected")
    else:
        functionality_issues.append("No game loop/animation found")
        print(f"❌ No game loop/animation found")
    
    # 4. Win Condition (2 points) - NEW!
    win_patterns = ['win', 'victory', 'won', 'complete', 'success', 'youwin', 'gamewon', 'levelcomplete']
    win_screen_patterns = ['restart', 'play again', 'playagain', 'game over', 'gameover']
    win_found = any(pattern in game_code.lower().replace(' ', '').replace('_', '') for pattern in win_patterns)
    win_screen_found = any(pattern in game_code.lower() for pattern in win_screen_patterns)
    
    if win_found and win_screen_found:
        functionality_score += 2
        print(f"✅ Win condition and end screen detected")
    elif win_found or win_screen_found:
        functionality_score += 1
        functionality_warnings.append("Partial win condition found - may need win/game over screen")
        print(f"⚠️  Partial win condition detected")
    else:
        functionality_issues.append("No win condition found - game may be endless")
        print(f"❌ No win condition found")
    
    # 5. Loss Condition (2 points) - NEW!
    loss_patterns = ['lose', 'loss', 'lost', 'fail', 'gameover', 'game over', 'dead', 'lives', 'attempts']
    loss_found = any(pattern in game_code.lower().replace(' ', '') for pattern in loss_patterns)
    
    if loss_found:
        functionality_score += 2
        print(f"✅ Loss condition detected")
    else:
        functionality_warnings.append("No clear loss condition - game may be too easy or endless")
        print(f"⚠️  No loss condition detected")
    
    # 6. UI Text Spacing (1 point) - NEW!
    ui_spacing_patterns = ['measureText', 'padding', 'margin', 'spacing']
    ui_spacing_found = any(pattern in game_code.lower() for pattern in ui_spacing_patterns)
    
    # Check for potential UI overlaps (red flag patterns)
    overlap_warning_patterns = [
        'fillText.*fillText.*fillText',  # Multiple text draws in sequence without position changes
        'ctx.fillText.*\n.*ctx.fillText.*\n.*ctx.fillText'  # Multiple text draws close together
    ]
    
    if ui_spacing_found:
        functionality_score += 1
        print(f"✅ UI spacing considerations detected")
    else:
        functionality_warnings.append("No measureText() usage - text may overlap")
        print(f"⚠️  No UI spacing detected")
    
    # 7. Error Handling (1 point)
    error_patterns = ['try', 'catch', 'console.error', 'console.warn', 'if.*error']
    error_handling = any(pattern in game_code.lower() for pattern in error_patterns)
    if error_handling:
        functionality_score += 1
        print(f"✅ Error handling detected")
    else:
        functionality_warnings.append("No error handling found")
        print(f"⚠️  No error handling detected")
    
    # Calculate percentage
    functionality_percentage = (functionality_score / max_score) * 100
    
    print(f"🔍 Functionality Score: {functionality_score}/{max_score} ({functionality_percentage:.1f}%)")
    
    return {
        'score': functionality_score,
        'max_score': max_score,
        'percentage': functionality_percentage,
        'issues': functionality_issues,
        'warnings': functionality_warnings,
        'passing': functionality_percentage >= 60  # 60% threshold for basic functionality
    }

def test_all_games():
    """Test basic functionality for all existing games"""
    print("🔍 Testing basic functionality for all games...")
    
    # Get all game files
    game_files = sorted(glob.glob("games/2025-*.js"))
    
    if not game_files:
        print("No game files found!")
        return
    
    results = {}
    total_score = 0
    passing_games = 0
    
    for game_file in game_files:
        game_name = os.path.basename(game_file)
        print(f"\n{'='*50}")
        print(f"Testing: {game_name}")
        print(f"{'='*50}")
        
        try:
            with open(game_file, 'r') as f:
                game_code = f.read()
            
            result = validate_accessibility(game_code, game_name)
            results[game_name] = result
            total_score += result['percentage']
            
            if result['passing']:
                passing_games += 1
                
        except Exception as e:
            print(f"❌ Error reading {game_name}: {e}")
            results[game_name] = {'error': str(e)}
    
    # Summary
    print(f"\n{'='*50}")
    print(f"BASIC FUNCTIONALITY TEST SUMMARY")
    print(f"{'='*50}")
    print(f"Total games tested: {len(game_files)}")
    print(f"Games passing (≥60%): {passing_games}")
    print(f"Games failing: {len(game_files) - passing_games}")
    print(f"Average score: {total_score/len(game_files):.1f}%")
    
    # Show worst performers
    failing_games = [(name, result) for name, result in results.items() 
                    if 'error' not in result and not result['passing']]
    if failing_games:
        print(f"\nGames needing improvement:")
        for name, result in sorted(failing_games, key=lambda x: x[1]['percentage']):
            print(f"  - {name}: {result['percentage']:.1f}%")
            for issue in result['issues']:
                print(f"    ❌ {issue}")
    
    # Show best performers
    passing_games_list = [(name, result) for name, result in results.items() 
                         if 'error' not in result and result['passing']]
    if passing_games_list:
        print(f"\nTop performing games:")
        for name, result in sorted(passing_games_list, key=lambda x: x[1]['percentage'], reverse=True)[:3]:
            print(f"  - {name}: {result['percentage']:.1f}%")
    
    # Return overall results for CI/CD integration
    return {
        'total_games': len(game_files),
        'passing_games': passing_games,
        'failing_games': len(game_files) - passing_games,
        'average_score': total_score/len(game_files) if game_files else 0,
        'all_passing': passing_games == len(game_files)
    }

if __name__ == "__main__":
    results = test_all_games()
    
    # Exit with error code if any games are failing (for CI/CD)
    if not results['all_passing']:
        print(f"\n❌ {results['failing_games']} games are failing basic functionality tests!")
        exit(1)
    else:
        print(f"\n✅ All games pass basic functionality tests!")
        exit(0) 