# Ryan Family Menu

This is a first working prototype for a private family dinner planner.

Open `index.html` in a browser, or use the local preview URL while the server is running.

Current features:

- Weekly dinner schedule
- Monthly recipe calendar with editable dinner dates
- Recipe library
- "Tonight" dinner view
- English / Spanish toggle
- First recipe entered from the uploaded meatball recipe photos
- Second recipe entered from the uploaded Chicken Milanese recipe photos
- Third recipe entered from the uploaded halibut with summer vegetables recipe photos
- Fourth recipe entered from the uploaded Lemon Chicken family recipe photo
- Potato side dish entered from the uploaded smashed potato fries photo
- Lemon Bucatini Pasta entered from the uploaded recipe photo
- Pasta with Meat Sauce entered from the uploaded recipe photo
- Strawberry Crunch Salad entered from the uploaded recipe photos
- Roasted Brussels Sprouts Salad entered from the uploaded recipe photos
- Chicken Noodle Soup entered with a possible allergy warning from the uploaded family note
- Ina Garten's Pot Roast entered from the uploaded recipe photos
- Basil Pesto Pasta entered from the uploaded recipe photos
- Original recipe photos kept beside the cleaned-up recipe card
- Draft upload form for adding the next recipe photos

Good next uploads:

- 5 to 10 common family dinners
- Any recipe the babysitter may cook
- Kid preference notes, substitutions, or location notes for ingredients

The current version stores edits in this browser. The next version should add a shared login and database so everyone sees and can update the same recipe calendar from their own phone.

## Deploying

This folder is ready for Netlify. Use `.` as the publish directory and leave the build command blank.

After connecting this repo to Netlify, any pushed update should redeploy the Ryan Family Menu site automatically.

## Inventory Photo Scanning

The inventory scanner uses the OpenAI API from the Netlify function at `netlify/functions/recognize-inventory.js`. Manual inventory entry works without this setup; these steps only enable the "Scan photos" button.

1. Create or open an OpenAI API account at `https://platform.openai.com/`.
2. Add a small API billing budget or credit limit first, such as $5, so the inventory trial stays controlled.
3. Create a project API key.
4. In Netlify, open the site settings and add these environment variables:
   - `OPENAI_API_KEY`: your OpenAI project API key
   - `OPENAI_MODEL`: optional; defaults to `gpt-5.4-mini`
5. Redeploy the Netlify site after saving the environment variables.

Once deployed, open the app, go to Home inventory, upload fridge, freezer, pantry, or receipt photos, and review the suggestions before adding them.
