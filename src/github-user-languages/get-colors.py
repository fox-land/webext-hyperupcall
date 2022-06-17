import json
import os
import subprocess

import yaml

# From https://github.com/doda/github-language-colors

subprocess.call(['wget', 'https://raw.githubusercontent.com/github/linguist/master/lib/linguist/languages.yml', '-q'])

with open('languages.yml') as f:
    langs = yaml.load(f, Loader=yaml.FullLoader)
os.remove('languages.yml')
colors = {name: lang['color'] for name, lang in langs.items() if 'color' in lang}

with open('dist/colors.json', 'w') as f:
    json.dump(colors, f)
