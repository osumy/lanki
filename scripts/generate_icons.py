import os
from PIL import Image, ImageDraw

def generate_icons():
    icons_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(icons_dir, exist_ok=True)
    
    sizes = [16, 32, 48, 128]
    
    for size in sizes:
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        radius = int(size * 0.22)
        margin = max(1, int(size * 0.04))
        rect = [margin, margin, size - margin, size - margin]
        
        bg_color = (79, 70, 229, 255) # #4F46E5
        draw.rounded_rectangle(rect, radius=radius, fill=bg_color)
        
        card_margin_x = int(size * 0.2)
        card_margin_y = int(size * 0.2)
        card_w = size - 2 * card_margin_x
        card_h = size - 2 * card_margin_y
        
        card_rect = [
            card_margin_x,
            card_margin_y,
            size - card_margin_x,
            size - card_margin_y
        ]
        card_radius = max(2, int(size * 0.1))
        draw.rounded_rectangle(card_rect, radius=card_radius, fill=(255, 255, 255, 245))
        
        l_color = (79, 70, 229, 255)
        stroke_w = max(1, int(size * 0.11))
        
        left = int(card_rect[0] + card_w * 0.3)
        right = int(card_rect[0] + card_w * 0.72)
        top = int(card_rect[1] + card_h * 0.25)
        bottom = int(card_rect[1] + card_h * 0.75)
        
        draw.rectangle([left, top, left + stroke_w, bottom], fill=l_color)
        draw.rectangle([left, bottom - stroke_w, right, bottom], fill=l_color)
        
        dot_size = max(1, int(size * 0.09))
        dot_x = int(card_rect[0] + card_w * 0.65)
        dot_y = int(card_rect[1] + card_h * 0.25)
        draw.ellipse([dot_x, dot_y, dot_x + dot_size, dot_y + dot_size], fill=(245, 158, 11, 255))
        
        output_path = os.path.join(icons_dir, f"icon-{size}.png")
        img.save(output_path, "PNG")
        print(f"Generated {output_path}")

if __name__ == "__main__":
    generate_icons()
