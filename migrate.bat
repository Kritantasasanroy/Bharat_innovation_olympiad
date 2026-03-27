@echo off
echo Moving admin pages...
move "d:\lemon ideas work stuff\bharat Innovation Olympiad\frontend\src\app\admin\dashboard" "d:\lemon ideas work stuff\bharat Innovation Olympiad\admin-frontend\src\app\dashboard"
move "d:\lemon ideas work stuff\bharat Innovation Olympiad\frontend\src\app\admin\exams" "d:\lemon ideas work stuff\bharat Innovation Olympiad\admin-frontend\src\app\exams"
move "d:\lemon ideas work stuff\bharat Innovation Olympiad\frontend\src\app\admin\analytics" "d:\lemon ideas work stuff\bharat Innovation Olympiad\admin-frontend\src\app\analytics"
move "d:\lemon ideas work stuff\bharat Innovation Olympiad\frontend\src\app\admin\questions" "d:\lemon ideas work stuff\bharat Innovation Olympiad\admin-frontend\src\app\questions"

echo Deleting original admin folder...
rmdir /s /q "d:\lemon ideas work stuff\bharat Innovation Olympiad\frontend\src\app\admin"

echo Done!
