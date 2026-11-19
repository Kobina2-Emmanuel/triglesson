# Angles of Elevation and Depression

A 3D interactive Core Mathematics lesson (SHS 3, 60 minutes) on angles of elevation and depression. It runs in any modern browser on phones, tablets and laptops, and can be installed and used offline.

Built with plain HTML, CSS and JavaScript, [Three.js](https://threejs.org/) (r128) for the 3D scenes and [KaTeX](https://katex.org/) (0.16.9) for equations. There is no build step.

## Lesson flow

The lesson has nine steps, shown in the sidebar menu:

| Step | Time | Content |
|------|------|---------|
| Review | 0 to 4 min | Right-angled triangle recap, with a quick quiz |
| Objectives | 4 to 6 min | Checklist of what students should be able to do |
| Demo | 6 to 13 min | Kwame and Ama: watch the angles form, then name them |
| Concept | 13 to 18 min | Elevation, depression and comparing the two |
| Model | 18 to 24 min | Slider that swings the sightline, with the Z-angle toggle |
| Example 1 | 24 to 30 min | Height of a flagpole (step by step) |
| Example 2 | 30 to 36 min | Angle of depression from a cliff (step by step) |
| Groups | 36 to 50 min | Task A and Task B with answer checking |
| Your turn | 50 to 60 min | Two practice questions and a take-home problem |

Students can drag the 3D scene to rotate it. On touch screens, pinch zooms. On a laptop, Ctrl or Cmd plus scroll zooms, and double-click resets the view.

## Files

```
index.html               Lesson content and page structure
style.css                Styles and responsive layouts
script.js                3D scenes, lesson interactivity, offline registration
sw.js                    Service worker (offline support)
manifest.webmanifest     Lets the lesson be installed as an app
vercel.json              Vercel headers (keeps sw.js from being cached)
icons/                   App icons
```

## Run it locally

The service worker only runs on `http://localhost` or HTTPS, so do not just double-click `index.html`. From the project folder:

```
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Any other static server works too.

## Deploy to GitHub and Vercel

1. Put all the files in the **root** of your GitHub repo (`index.html` must not be inside a sub-folder).
2. In Vercel, import the repo. Choose the **Other** framework preset and leave the build command and output directory empty.
3. Deploy. Vercel serves it over HTTPS, which offline mode needs.

## Offline use

Offline support is provided by `sw.js`.

- **Your own files** (HTML, CSS, JS) load from the network when online, so deploys reach students. If the network is down or slower than 4 seconds, the saved copy is used.
- **Three.js, KaTeX and the fonts** are loaded from CDNs. The service worker saves them the first time a device visits online, then serves them from that saved copy.
- Students can also install the lesson to their home screen from the browser menu.

**Each device must open the site once while online.** After the "Saved. This lesson now works offline." notice appears, it works without a connection.

### Every time you deploy

Open `sw.js` and change the version number, for example from `'v1'` to `'v2'`:

```js
const VERSION = 'v2';
```

This clears old saved copies. Devices update the next time they open the lesson online.

### Known limits

- The CDN download has not been tested end to end. If a first visit is on a weak connection, some KaTeX fonts may fail to save, and equations could look wrong offline. A short message appears if saving did not finish.
- If a school network blocks `cdnjs.cloudflare.com` or Google Fonts, the first visit will not load the 3D scenes or equations.
- For a setup that never depends on a CDN, download Three.js, KaTeX and the fonts into the repo (for example a `vendor/` folder), point `index.html` at those files, and update the lists at the top of `sw.js`.

## Screen layouts

`script.js` picks a layout from the screen size and orientation, and `style.css` reads it from a class on `<body>`.

| Device | Layout |
|--------|--------|
| Phones and tablets in portrait | Lesson card as a bottom sheet under the 3D scene; the menu slides in as a drawer |
| Phones in landscape | Card on the left, scene on the right; the menu is a drawer |
| Laptops and tablets in landscape | Docked sidebar with the card on the left; the sidebar starts slim at 1280px and below |

On touch devices, vertical dragging on the scene scrolls the page, while horizontal dragging rotates it.

## Editing the lesson

- **Text, questions and answers:** edit `index.html`. Equations use KaTeX, written as `\( ... \)` inline and `\[ ... \]` for display. Task answers are set with `data-a` (answer) and `data-tol` (tolerance) on each input.
- **Colours:** change the variables at the top of `style.css`.
- **3D scenes:** each scene is defined in `script.js`, in the section before `ENGINE`.

## Browser support

Current versions of Chrome, Edge, Firefox and Safari (including iOS and Android). A device needs WebGL for the 3D scenes. Without it, the lesson text still works.
