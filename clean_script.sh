#!/bin/bash
echo "Removing useless patch, fix, and test files from the root..."
rm -fv patch_*.js patch_*.py
rm -fv fix_*.js fix_*.py fix_*.md
rm -fv test_*.js test_*.dart test_*.json test_*.js.* test2.js test.js
rm -fv parse_*.js parse_*.py
rm -fv debug_*.py simulate_*.js safe_patch.js clean.js restore_*.js count_*.js decode_*.js revert_*.js
rm -fv explanation.txt dialog_code.txt extracted_m1.txt last_user_input.* server.log server.pid backend.pid backend.zip backend\ 2.zip
rm -fv test_text.dart

echo "Removing test files from backend directory..."
cd backend
rm -fv test_*.js diag_out.json output_bundle.json test_bundle.json prescription_test.pdf
cd ..

echo "Cleanup complete!"
