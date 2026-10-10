import os
import glob
from PIL import Image, ImageDraw

source_image_path = r"C:\Users\BHALAKSH VAIRAGKAR\.gemini\antigravity\brain\b06dc8c6-52c0-49df-9c40-4092152a0815\.user_uploaded\media_1788263456540.jpg"

target_res_dirs = [
    r"C:\Users\BHALAKSH VAIRAGKAR\AndroidStudioProjects\ResQNet\app\src\main\res",
    r"C:\Users\BHALAKSH VAIRAGKAR\.gemini\antigravity\scratch\resqnet\android\app\src\main\res"
]

dashboard_dir = r"C:\Users\BHALAKSH VAIRAGKAR\.gemini\antigravity\scratch\resqnet\dashboard"

img = Image.open(source_image_path).convert("RGBA")

# Ensure image is square
width, height = img.size
min_dim = min(width, height)
left = (width - min_dim) // 2
top = (height - min_dim) // 2
right = left + min_dim
bottom = top + min_dim
img_cropped = img.crop((left, top, right, bottom))

sizes = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192
}

def create_circular_icon(square_img):
    size = square_img.size
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size[0], size[1]), fill=255)
    
    round_img = Image.new('RGBA', size, (255, 255, 255, 0))
    round_img.paste(square_img, (0, 0), mask=mask)
    return round_img

for res_dir in target_res_dirs:
    if not os.path.exists(res_dir):
        continue
        
    # Remove conflicting webp files
    for old_webp in glob.glob(os.path.join(res_dir, "mipmap-*", "*.webp")):
        try:
            os.remove(old_webp)
        except Exception:
            pass
            
    old_fg_xml = os.path.join(res_dir, "drawable", "ic_launcher_foreground.xml")
    if os.path.exists(old_fg_xml):
        try:
            os.remove(old_fg_xml)
        except Exception:
            pass
            
    # 1. Generate density mipmaps (PNG only)
    for folder, size in sizes.items():
        folder_path = os.path.join(res_dir, folder)
        os.makedirs(folder_path, exist_ok=True)
        
        # Standard square icon
        resized_sq = img_cropped.resize((size, size), Image.Resampling.LANCZOS)
        resized_sq.save(os.path.join(folder_path, "ic_launcher.png"), "PNG")
        
        # Circular icon
        round_icon = create_circular_icon(resized_sq)
        round_icon.save(os.path.join(folder_path, "ic_launcher_round.png"), "PNG")
        print(f"Generated {folder} ({size}x{size}) in {res_dir}")
        
    # 2. Generate drawable foreground and high-res logo
    drawable_dir = os.path.join(res_dir, "drawable")
    os.makedirs(drawable_dir, exist_ok=True)
    
    # Standard logo
    logo_512 = img_cropped.resize((512, 512), Image.Resampling.LANCZOS)
    logo_512.save(os.path.join(drawable_dir, "resqnet_logo.png"), "PNG")
    
    # Adaptive icon foreground (centered with 72/108 ratio safe zone)
    adaptive_canvas = Image.new('RGBA', (432, 432), (255, 255, 255, 0))
    inner_logo = img_cropped.resize((324, 324), Image.Resampling.LANCZOS)
    adaptive_canvas.paste(inner_logo, (54, 54), mask=inner_logo)
    adaptive_canvas.save(os.path.join(drawable_dir, "ic_launcher_foreground.png"), "PNG")

    # Update ic_launcher_background.xml to clean white
    bg_xml_content = '''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M0,0h108v108h-108z" />
</vector>
'''
    with open(os.path.join(drawable_dir, "ic_launcher_background.xml"), "w", encoding="utf-8") as f:
        f.write(bg_xml_content)

# 3. Generate Dashboard Favicon & Web Logo
if os.path.exists(dashboard_dir):
    favicon = img_cropped.resize((64, 64), Image.Resampling.LANCZOS)
    favicon.save(os.path.join(dashboard_dir, "favicon.png"), "PNG")
    favicon.save(os.path.join(dashboard_dir, "favicon.ico"), "ICO")
    web_logo = img_cropped.resize((256, 256), Image.Resampling.LANCZOS)
    web_logo.save(os.path.join(dashboard_dir, "logo.png"), "PNG")
    print(f"Generated web logos in {dashboard_dir}")

print("New Shield Logo Generation Completed Successfully!")
