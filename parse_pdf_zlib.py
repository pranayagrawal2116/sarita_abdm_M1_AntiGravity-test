import re
import zlib

def extract_pdf_text(filepath):
    with open(filepath, 'rb') as f:
        content = f.read()
    
    # Extract FlateDecode streams
    streams = re.findall(b'stream\r\n(.*?)\r\nendstream', content, re.DOTALL)
    if not streams:
        streams = re.findall(b'stream\n(.*?)\nendstream', content, re.DOTALL)
        
    text = ""
    for s in streams:
        try:
            decompressed = zlib.decompress(s)
            # Find TJ or Tj commands (basic text extraction)
            text_blocks = re.findall(b'\((.*?)\)\s*T[jJ]', decompressed)
            for block in text_blocks:
                try:
                    text += block.decode('utf-8', 'ignore') + " "
                except:
                    pass
        except:
            pass
    return text

import sys
if len(sys.argv) > 1:
    res = extract_pdf_text(sys.argv[1])
    for match in re.finditer(r'(.{0,50})(Authorization|X-AUTH-TOKEN|JWT|JWKS|Keycloak|certs|signature)(.{0,50})', res, re.IGNORECASE):
        print(match.group(0))
