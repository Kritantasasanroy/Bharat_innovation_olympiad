@echo off
cd "d:\lemon ideas work stuff\bharat Innovation Olympiad\admin-frontend"
echo Installing dependencies...
call npm install axios zustand lucide-react js-cookie
call npm install -D @types/js-cookie

echo Copying shared folders...
xcopy /s /e /y /i "..\frontend\src\lib" "src\lib"
xcopy /s /e /y /i "..\frontend\src\hooks" "src\hooks"
xcopy /s /e /y /i "..\frontend\src\store" "src\store"
xcopy /s /e /y /i "..\frontend\src\components" "src\components"

echo Copying shared files...
copy /y "..\frontend\src\app\globals.css" "src\app\globals.css"
copy /y "..\frontend\tailwind.config.ts" "tailwind.config.ts"

echo Done!
