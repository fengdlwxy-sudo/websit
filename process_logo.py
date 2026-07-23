from PIL import Image, ImageDraw, ImageFont
import os

input_path = "E:/WorkBuddy2/hcym/logo.png"
output_dir = "E:/WorkBuddy2/hcym/assets/images"
os.makedirs(output_dir, exist_ok=True)

# Load original logo
img = Image.open(input_path).convert("RGBA")
width, height = img.size

# 1. Create white logo symbol (for dark backgrounds)
# Extract the white/light parts and make them pure white, rest transparent
white_logo = Image.new("RGBA", img.size, (0, 0, 0, 0))
for x in range(width):
    for y in range(height):
        r, g, b, a = img.getpixel((x, y))
        # If pixel is light enough (the HC symbol), make it white
        if r > 150 and g > 150 and b > 150 and a > 100:
            white_logo.putpixel((x, y), (255, 255, 255, 255))
        # If pixel is the teal background, make transparent
        else:
            white_logo.putpixel((x, y), (0, 0, 0, 0))
white_logo.save(os.path.join(output_dir, "logo-white.png"))

# 2. Create colored logo on transparent background (preserve original teal symbol)
colored_logo = Image.new("RGBA", img.size, (0, 0, 0, 0))
for x in range(width):
    for y in range(height):
        r, g, b, a = img.getpixel((x, y))
        # Make background transparent, keep colored symbol
        if r < 140 and g > 140 and b > 140 and a > 100:
            # It's teal, keep it but maybe enhance
            colored_logo.putpixel((x, y), (0, 168, 168, 255))
        elif r > 150 and g > 150 and b > 150 and a > 100:
            colored_logo.putpixel((x, y), (255, 255, 255, 255))
        else:
            colored_logo.putpixel((x, y), (0, 0, 0, 0))
colored_logo.save(os.path.join(output_dir, "logo-color.png"))

# 3. Create full logo with brand text
brand_text = "汇程移民"
slogan_text = "HUICHENG IMMIGRATION"
# Create a wider canvas
full_width = 260
full_height = 60
full_logo = Image.new("RGBA", (full_width, full_height), (0, 0, 0, 0))

# Paste white logo symbol (resize)
logo_resized = white_logo.resize((50, 50), Image.LANCZOS)
full_logo.paste(logo_resized, (5, 5), logo_resized)

# Add text
draw = ImageDraw.Draw(full_logo)
# Try to use a Chinese font
try:
    font_cn = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 24)
    font_en = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 10)
except:
    font_cn = ImageFont.load_default()
    font_en = ImageFont.load_default()

draw.text((62, 8), brand_text, fill=(255, 255, 255, 255), font=font_cn)
draw.text((62, 36), slogan_text, fill=(255, 255, 255, 200), font=font_en)
full_logo.save(os.path.join(output_dir, "logo-full-white.png"))

# 4. Create colored full logo
colored_full = Image.new("RGBA", (full_width, full_height), (0, 0, 0, 0))
logo_color_resized = colored_logo.resize((50, 50), Image.LANCZOS)
colored_full.paste(logo_color_resized, (5, 5), logo_color_resized)
draw2 = ImageDraw.Draw(colored_full)
draw2.text((62, 8), brand_text, fill=(0, 150, 150, 255), font=font_cn)
draw2.text((62, 36), slogan_text, fill=(102, 102, 102, 255), font=font_en)
colored_full.save(os.path.join(output_dir, "logo-full-color.png"))

# 5. Create favicon (32x32)
favicon = colored_logo.resize((32, 32), Image.LANCZOS)
favicon.save(os.path.join(output_dir, "favicon.png"))

print("Logo variants created successfully!")
print([f for f in os.listdir(output_dir) if f.startswith("logo") or f == "favicon.png"])
