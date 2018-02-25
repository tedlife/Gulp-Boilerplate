"use strict";

// ---------------------------------------------------------------------
// | Options                                                           |
// ---------------------------------------------------------------------

// Development root
const dev = "src";

// Distribution root
const dist = "dist";

// temp
const temp = ".tmp";

// Image directories
const imgDev = `${dev}/img`;
const imgDist = `${dist}/img`;
const imgTemp = `${temp}/img`;

// CSS directories
const cssDev = `${dev}/css`;
const cssDist = `${dist}/css`;
const cssTemp = `${temp}/css`;

// JS directories
const jsDev = `${dev}/js`;
const jsDist = `${dist}/js`;
const jsTemp = `${temp}/js`;

// ---------------------------------------------------------------------
// | Dependencies                                                      |
// ---------------------------------------------------------------------

import fs from "fs";
import path from "path";
import gulp from "gulp";
import del from "del";
import runSequence from "run-sequence";
import browserSync from "browser-sync";
import gulpLoadPlugins from "gulp-load-plugins";
import modernizr from "modernizr";
import { output as pagespeed } from "psi";

import pkg from "./package.json";
import modernizrConfig from "./modernizr-config.json";

/**
 * css 兼容处理的依赖
 */

// use Sass-like markup and staged CSS features in CSS
import precss from "precss";
// adds vendor prefixes for you, using data from Can I Use
import autoprefixer from "autoprefixer";
// transforms rgba() to hexadecimal
import color_rgba_fallback from "postcss-color-rgba-fallback";
// generates vm fallback for vmin unit in IE9
import vmin from "postcss-vmin";
// generates pixel fallbacks for rem units
import pixrem from "pixrem";
// inserts 3D hack before will-change property
import will_change from "postcss-will-change";

/**
 * css 压缩与优化的依赖
 */

// joins matching CSS media queries into a single statement
import mqpacker from "css-mqpacker";
// contains plugins that optimize CSS size for use in production
import cssnano from "cssnano";
// removes unused CSS from your stylesheets
import uncss from "uncss";

const $ = gulpLoadPlugins({
  rename: {
    "gulp-svg-symbols": "svgSymbols"
  }
});
const createServer = browserSync.create();
const reload = browserSync.reload;

// ---------------------------------------------------------------------
// | Tasks                                                             |
// ---------------------------------------------------------------------

// Clean output directory
gulp.task("clean", () =>
  del([`${temp}`, `${dist}/*`, `!${dist}/.git`], {
    dot: true
  })
);

// Optimize images
gulp.task("images", () =>
  gulp
    .src(`${imgDev}/**/*`)
    .pipe(
      $.cache(
        $.imagemin({
          progressive: true,
          interlaced: true
        })
      )
    )
    .pipe(gulp.dest(imgDist))
    .pipe($.size({ title: "images" }))
);

// generate svg sprite symbol
gulp.task("sprite", () =>
  gulp
    .src(`${imgDev}/svg/**/*`)
    .pipe($.newer(`${imgTemp}/svg`))
    .pipe(
      $.svgSymbols({
        id: "icon-%f",
        class: ".icon-%f",
        templates: ["default-svg", "default-css", "default-demo"],
        svgAttrs: {
          class: "svg-icon-lib",
          "aria-hidden": "true",
          style: "position: absolute;",
          "data-enabled": true
        }
      })
    )
    .pipe(gulp.dest(`${imgTemp}/svg`))
);

// Copy files
gulp.task("copy", ["copy:root", "copy:js", "copy:svg"]);

// Copy all js in  js/vendor dir
gulp.task("copy:js", () =>
  gulp.src(`${jsDev}/vendor/*`).pipe(gulp.dest(`${jsDist}/vendor`))
);

// Copy all svg sprite in img/svg dir
gulp.task("copy:svg", () =>
  gulp.src(`${imgTemp}/svg/*.svg`).pipe(gulp.dest(`${imgDist}/svg`))
);

// Copy all files at the root level (app)
gulp.task("copy:root", () =>
  gulp
    .src([`${dev}/*`, `!${dev}/*.html`], {
      dot: true
    })
    .pipe(gulp.dest(`${dist}`))
    .pipe($.size({ title: "copy" }))
);

// Compile and automatically prefix stylesheets
gulp.task("styles", () => {
  const AUTOPREFIXER_BROWSERS = [
    "ie >= 9",
    "ie_mob >= 10",
    "ff >= 30",
    "chrome >= 34",
    "safari >= 7",
    "opera >= 23",
    "ios >= 7",
    "android >= 4.4",
    "bb >= 10"
  ];

  const processors1 = [
    precss,
    will_change,
    color_rgba_fallback,
    vmin,
    pixrem,
    autoprefixer(AUTOPREFIXER_BROWSERS)
  ];

  const processors2 = [
    mqpacker,
    cssnano,
    uncss.postcssPlugin({
      html: [`${dev}/*.html`]
    })
  ];

  // For best performance, don't add Sass partials to `gulp.src`
  return gulp
    .src(`${cssDev}/**/*.scss`)
    .pipe($.newer(cssTemp))
    .pipe($.sourcemaps.init())
    .pipe(
      $.sass({
        precision: 10
      }).on("error", $.sass.logError)
    )
    .pipe($.postcss(processors1))
    .pipe(gulp.dest(cssTemp))
    .pipe($.if("*.css", $.postcss(processors2)))
    .pipe($.size({ title: "styles" }))
    .pipe($.sourcemaps.write("./"))
    .pipe(gulp.dest(cssDist))
    .pipe(gulp.dest(cssTemp))
    .pipe(browserSync.stream({ match: "**/*.css" }));
});

// Concatenate and minify JavaScript. Optionally transpiles ES2015 code to ES5.
// to enable ES2015 support remove the line `"only": "gulpfile.babel.js",` in the
// `.babelrc` file.
gulp.task("scripts", () =>
  gulp
    .src([
      // Note: Since we are not using useref in the scripts build pipeline,
      //       you need to explicitly list your scripts here in the right order
      //       to be correctly concatenated
      `${jsDev}/plugins.js`,
      `${jsDev}/main.js`
    ])
    .pipe($.newer(jsTemp))
    .pipe($.sourcemaps.init())
    .pipe($.babel())
    .pipe($.sourcemaps.write())
    .pipe(gulp.dest(jsTemp))
    .pipe($.concat("main.min.js"))
    .pipe($.uglify())
    // Output files
    .pipe($.size({ title: "scripts" }))
    .pipe($.sourcemaps.write("."))
    .pipe(gulp.dest(jsDist))
    .pipe(gulp.dest(jsTemp))
);

// Scan your HTML for assets & optimize them
gulp.task("html", () => {
  return (
    gulp
      .src(`${dev}/**/*.html`)
      .pipe(
        $.useref({
          searchPath: `{${temp},${dev}}`,
          noAssets: true
        })
      )

      // Minify any HTML
      .pipe(
        $.if(
          "*.html",
          $.htmlmin({
            removeComments: true,
            collapseWhitespace: true,
            collapseBooleanAttributes: true,
            removeAttributeQuotes: true,
            removeRedundantAttributes: true,
            removeEmptyAttributes: true,
            removeScriptTypeAttributes: true,
            removeStyleLinkTypeAttributes: true,
            removeOptionalTags: true
          })
        )
      )
      // Output files
      .pipe($.if("*.html", $.size({ title: "html", showFiles: true })))
      .pipe(gulp.dest(dist))
  );
});

// Watch files for changes & reload
gulp.task("serve", ["sprite", "scripts", "styles"], () => {
  browserSync({
    logPrefix: "GB",
    server: [temp, dev],
    port: 3000
  });

  gulp.watch([`${dev}/**/*.html`], reload);
  gulp.watch([`${cssDev}/**/*.scss`], ["styles"]);
  gulp.watch([`${jsDev}/**/*.js`], ["scripts", reload]);
  gulp.watch([`${imgDev}/**/*`, `!${imgDev}/svg/**/*`], reload);
  gulp.watch([`${imgDev}/svg/**/*`], ["sprite", reload]);
});

// Build production files, the default task
gulp.task("build", ["clean"], done =>
  runSequence("styles", ["html", "scripts", "images"], "sprite", "copy", done)
);

// modernizr
gulp.task("modernizr", done => {
  modernizr.build(modernizrConfig, code => {
    fs.writeFile(`${jsDev}/vendor/modernizr.min.js`, code, done);
  });
});

// jQuery
gulp.task("jquery", () =>
  gulp
    .src(["node_modules/jquery/dist/jquery.min.js"])
    .pipe(gulp.dest(`${jsDev}/vendor`))
);

gulp.task("update", ["modernizr", "jquery"]);

// Run PageSpeed Insights
gulp.task("pagespeed", done =>
  // Update the below URL to the public URL of your site
  pagespeed(
    "example.com",
    {
      strategy: "mobile"
      // By default we use the PageSpeed Insights free (no API key) tier.
      // Use a Google Developer API key if you have one: http://goo.gl/RkN0vE
      // key: 'YOUR_API_KEY'
    },
    done
  )
);
