@rem ResQNet Gradle wrapper bootstrap
@echo off
set APP_HOME=%~dp0
if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
rem Do not keep Gradle's zip/JAR cache in OneDrive: its sync locks archive files during compilation.
if "%GRADLE_USER_HOME%"=="" set GRADLE_USER_HOME=%LOCALAPPDATA%\ResQNet\gradle
"%JAVA_HOME%\bin\java.exe" -classpath "%APP_HOME%gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
