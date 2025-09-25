import { Readable } from 'node:stream';
import * as _$ from 'marko/html';
import * as buffer from 'buffer';
import * as tty from 'tty';
import * as util from 'util';
import * as fs from 'fs';
import * as net from 'net';
import * as http from 'http';
import { createServer } from 'http';
import * as zlib from 'zlib';
import zlib__default from 'zlib';
import * as path from 'path';
import { dirname } from 'path';
import * as url from 'url';
import { fileURLToPath } from 'url';
import * as events from 'events';
import * as stream from 'stream';
import * as crypto from 'crypto';

function getForwardedHeader(req, name) {
  const value = req.headers["x-forwarded-" + name];
  if (value) {
    if (typeof value === "string") {
      const index = value.indexOf(",");
      return index < 0 ? value : value.slice(0, index);
    }
    return value[0];
  }
}
function getOrigin(req, trustProxy) {
  const protocol = trustProxy && getForwardedHeader(req, "proto") || req.socket.encrypted && "https" || req.protocol || "http";
  let host = trustProxy && getForwardedHeader(req, "host") || req.headers.host;
  if (!host) {
    {
      throw new Error(
        `Could not automatically determine the origin host. Use the 'origin' option or the 'ORIGIN' environment variable to set the origin explicitly.`
      );
    }
  }
  return `${protocol}://${host}`;
}
function copyResponseHeaders(response, headers) {
  for (const [key, value] of headers) {
    if (key !== "set-cookie") {
      response.setHeader(key, value);
    }
  }
  const setCookies = headers.getSetCookie();
  if (setCookies == null ? void 0 : setCookies.length) {
    response.appendHeader("set-cookie", setCookies);
  }
}
function createMiddleware(fetch, options) {
  const {
    origin = process.env.ORIGIN,
    trustProxy = process.env.TRUST_PROXY === "1",
    createPlatform = (platform) => platform
  } = options ?? (options = {});
  return async (req, res, next) => {
    var _b, _c;
    try {
      var devWebSocket; if (false) ;
      let body;
      switch (req.method) {
        case "POST":
        case "PUT":
        case "PATCH":
          if (Readable.isDisturbed(req)) {
            body = bodyConsumedErrorStream;
          } else {
            body = req;
          }
          break;
      }
      const url = new URL(req.url, origin || getOrigin(req, trustProxy));
      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        body,
        // @ts-expect-error: Node requires this for streams
        duplex: "half"
      });
      const platform = createPlatform({
        request: req,
        response: res
      });
      const response = await fetch(request, platform);
      if (res.destroyed || res.headersSent) {
        return;
      }
      if (response) {
        res.statusCode = response.status;
        copyResponseHeaders(res, response.headers);
        if (response.body) {
          for await (const chunk of response.body) {
            if (res.destroyed) return;
            res.write(chunk);
            (_b = res.flush) == null ? void 0 : _b.call(res);
          }
        } else if (!response.headers.has("content-length")) {
          res.setHeader("content-length", "0");
        }
        res.end();
      } else if (next) {
        next();
      }
    } catch (err) {
      const error = err;
      if (next) {
        next(error);
      } else {
        (_c = res.socket) == null ? void 0 : _c.destroySoon();
        console.error(error);
      }
    }
  };
}
var bodyConsumedErrorStream = new ReadableStream({
  pull(controller) {
    controller.error(
      new Error(
        "The request body stream has been destroyed or consumed by something before Marko Run."
      )
    );
  }
});

var NotHandled = Symbol(
  "marko-run not handled"
);
var NotMatched = Symbol(
  "marko-run not matched"
);
var parentContextLookup = /* @__PURE__ */ new WeakMap();
var serializedGlobals = { params: true, url: true };
var pageResponseInit = {
  status: 200,
  headers: { "content-type": "text/html;charset=UTF-8" }
};
globalThis.MarkoRun ?? (globalThis.MarkoRun = {
  NotHandled,
  NotMatched,
  route(handler) {
    return handler;
  }
});
var toReadable = (rendered) => {
  toReadable = rendered.toReadable ? (rendered2) => rendered2.toReadable() : (rendered2) => {
    let cancelled = false;
    return new ReadableStream({
      async start(ctrl) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of rendered2) {
            if (cancelled) {
              return;
            }
            ctrl.enqueue(encoder.encode(chunk));
          }
          ctrl.close();
        } catch (err) {
          if (!cancelled) {
            ctrl.error(err);
          }
        }
      },
      cancel() {
        cancelled = true;
      }
    });
  };
  return toReadable(rendered);
};
function createContext(route, request, platform, url = new URL(request.url)) {
  let meta;
  let params;
  let path;
  if (route) {
    meta = route.meta;
    params = route.params;
    path = route.path;
  } else {
    meta = {};
    params = {};
    path = "";
  }
  return {
    request,
    url,
    platform,
    meta,
    params,
    route: path,
    serializedGlobals,
    parent: parentContextLookup.get(request),
    async fetch(resource, init) {
      let request2;
      let url2;
      if (resource instanceof Request) {
        request2 = new Request(resource, init);
        url2 = new URL(request2.url);
      } else {
        url2 = typeof resource === "string" ? new URL(resource, this.url) : resource;
        request2 = new Request(url2, init);
      }
      parentContextLookup.set(request2, this);
      return await globalThis.__marko_run__.fetch(request2, this.platform) || new Response(null, { status: 404 });
    },
    render(template, input, init = pageResponseInit) {
      return new Response(
        toReadable(
          template.render({
            ...input,
            $global: this
          })
        ),
        init
      );
    },
    redirect(to, status) {
      return Response.redirect(
        typeof to === "string" ? new URL(to, this.url) : to,
        status
      );
    },
    back(fallback = "/", status) {
      return this.redirect(
        this.request.headers.get("referer") || fallback,
        status
      );
    }
  };
}
async function call(handler, next, context) {
  let response;
  {
    try {
      response = await handler(context, next);
    } catch (error) {
      if (error == null) {
        throw NotHandled;
      } else if (error instanceof Response) {
        return error;
      }
      throw error;
    }
  }
  if (response === null || response === NotMatched || response === NotHandled) {
    throw response || NotMatched;
  }
  return response || next();
}
function compose(handlers) {
  const len = handlers.length;
  if (!len) {
    return (_context, next) => next();
  } else if (len === 1) {
    return handlers[0];
  }
  return (context, next) => {
    let i = 0;
    return (function nextHandler() {
      return i < len ? call(handlers[i++], nextHandler, context) : next();
    })();
  };
}
function normalize(obj) {
  if (typeof obj === "function") {
    return obj;
  } else if (Array.isArray(obj)) {
    return compose(obj);
  } else if (obj instanceof Promise) {
    const promise = obj.then((value) => {
      fn = Array.isArray(value) ? compose(value) : value;
    });
    let fn = async (context, next) => {
      await promise;
      return fn(context, next);
    };
    return (context, next) => fn(context, next);
  }
  return passthrough;
}
function stripResponseBodySync(response) {
  return response.body ? new Response(null, response) : response;
}
function stripResponseBody(response) {
  return "then" in response ? response.then(stripResponseBodySync) : stripResponseBodySync(response);
}
function passthrough() {
}

const _faviconPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAAgY0hSTQAAeiYAAICEAAD6AAAAgOgAAHUwAADqYAAAOpgAABdwnLpRPAAAAAZiS0dEAP8A/wD/oL2nkwAAAAlwSFlzAAAASAAAAEgARslrPgAABiZJREFUWMPtlmuMXVUVx3/7cc69d+bO9N559DGlj6lTqZSmtYJatEnHKKAxMRIoCVGrxbYUyFCCiCbGGD+oIaGZ0sEURII8wkBEDBbpk0psoJa0tqU0CFRKsKXtvOc+zj33nH2WH3rvMGiaxsT4xf6Tk+ysc85a//9ae6294SIu4v8d6r/tsLDsYRCHMs0gjuwr3/jPCGzYvZ8DJ08u755/6Zeb0mlEAEhQ8oxS6sjdS+YB8PPHPkMUqzkrl418q7MtzCSiBNDGJNv/segH+83MsZuBDiABFMLzSql9s1+75/wEOh7oxyWSt7j+z3fOvrqrNY8IKJOQ6Pg3hbi43iob2MN3oX2n4sC/99PzSt/rvrSAUpDSCY02fs2VvJtOr1z1XUx8T10BJC9C9E1QQ3MO3DsR09QXXb/ehpOYhlTjbcr4awqR076NCKVMSRUIkvLHw6T6piBvNBdfwhp9tbbyk5HAZJttTINyZFWEdclMbaJC4fm5DxIFV0F5JgRAZR6EJ33j71/X3sXmM4cBsHUCueY2tGpbXI2ra0XEguJkEEizHURFTgENgtwZJG5fV+PwSDnJbbDCNBE4NpKWuamypFWka3rXdjzSv+Pk9V/ZhBc9DJI5J1Z6wnhob0qrQx/JwPW732dqNudrbX/akGr4UjbdSDadRZv0b0c5dqboip1lF1B2wSVlF4wtsG8tMJZbjIexPgToA0vTY680JvFCIgEnjRKSk/axvupf03MgWAQVoNKqCLXI8M4N0+e53jMnsKv/9D7ONmCN/ppnvRtE6jtD3kuS/C/eHR9oT0QWi9AKkNHRreOZKdU2Pe7V1IaJqE0zkvLeKNDzgSU1cV/NXvHBC4UtrRtVqvpZRDoBBG4Ct00p/dybl1+Ozmen0J72pmWt6cn5fnM+5ZNP+ZLzU1tymcGDw+WBXaW4/FTZlSm7Mm16oL2oMjPxPIxnMZ591vrq9+9Wsyckkj6JJJRIkEg8VeXOGVuOliWuPCRURKggVLJCtCGRsCOlDfov5UYajFrTZPhck4UmC1nDnpTm0UY9A89vdMD9gjoyyyuyKD2EUZogyQDmFJg+hVfsSEoIPI3iBVQti4qFSrPOzqo+Brz8oZnlGll1KD0XfVVDcZkTWT2pJStW8UDaqNMtwSCSOBakx95u1NGmT2YGj87wykdbTHhUK30swd5nifYlokl/YRgCXZRIbUrGzNlkxJCMGJIBs6pt9cBllchuHsMPRvEZxVdDpG+ZGg4stycCKVZFShPtCsZB1ipFsdLA2es2snLPdXR5o48vSI38QStRAIkoBDteoUnuXr4TgNLWJoBmNN6kCVPxPFfaZmdfYpUzdbOCkkFKNsC87hK3BeittaUH9FRF9vp+5u8Afd2/A4iAgfON1NEfzwIVt0qoNpCQn5h0orZs3b7gdE6FfSL4NXPsUJtbVHxQO+cAngB2TPL3KWBNtTyqr9l5lgth5P7p2EShm5LvmBa3wrQ5TJvDtLhXJSOPNki8Lke4NE9InpAc4YtZov5IBPvHFTmu3TE4prTuTZy7ApGpNb83a0nvlEheuhCB9BQhyYVLTKTWipybLQrKSrHx8H2d8/K2+u0PK8ygQ/VqGOk+8mc0QFQoE5VKu+NC8GQ0HlB72qNi0FMdLuRXPHn8vMFL21pxMyNfT3E9uiWeb1pjTGuManH9Q7um7M3Zyl05wml5QloIyVF9JBJ5OS3V+l44hxVPHEeS5GNJ7J5BZGm9VpLI7TaTerAyNMa+O5Z+JPhbTzfT2e7hkBuV8CuEpprX98STr59aP2cZht7avgI46FA3KuSdriOHgElnQfnUMNo3x5XWv5Qk6UMkXXt/R3W0tFfBG/+qfvZUSyzSoaEHRVNNjmDoO3XrnIoyctuk4KGCXq14x4ib8KHri/3fvxJXqeKC8KmoEGytniuDROPBJ+JSZX0wOOot+dGeiR8LO/Oku4fRsBZYNonXruoHtl8puR24DKiX/1mB50SEWUden/j43y4ki3+4G6X0QpArQdVPhnFgO1A69LPucxnbnQeUZxRfBKZTv3hoDpy4ofNtf0Z8LZCrEVAKXkWpv809fOiCXXURF3ER/1P8E+oo2XFV0bPuAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDE1LTA4LTI2VDE2OjM2OjAyKzAwOjAwgXV1bQAAACV0RVh0ZGF0ZTptb2RpZnkAMjAxNS0wOC0yNlQxNjozNjowMiswMDowMPAozdEAAABGdEVYdHNvZnR3YXJlAEltYWdlTWFnaWNrIDYuNy44LTkgMjAxNC0wNS0xMiBRMTYgaHR0cDovL3d3dy5pbWFnZW1hZ2ljay5vcmfchu0AAAAAGHRFWHRUaHVtYjo6RG9jdW1lbnQ6OlBhZ2VzADGn/7svAAAAGHRFWHRUaHVtYjo6SW1hZ2U6OmhlaWdodAAxOTIPAHKFAAAAF3RFWHRUaHVtYjo6SW1hZ2U6OldpZHRoADE5MtOsIQgAAAAZdEVYdFRodW1iOjpNaW1ldHlwZQBpbWFnZS9wbmc/slZOAAAAF3RFWHRUaHVtYjo6TVRpbWUAMTQ0MDYwNjk2MuwEGPsAAAAPdEVYdFRodW1iOjpTaXplADBCQpSiPuwAAABWdEVYdFRodW1iOjpVUkkAZmlsZTovLy9tbnRsb2cvZmF2aWNvbnMvMjAxNS0wOC0yNi9kYWI1YTMzYmM4MDI5OWQ2YmFhNmQ1NGIyZmI5MTEwMy5pY28ucG5nBTJ6eQAAAABJRU5ErkJggg==";

const Layout1 = _$.createTemplate("a", (input, $serialize) => {
  const $scope0_id = _$.nextScopeId();
  _$.write(`<!doctype html><html lang=en><head>${_$.toString(_$.$global().___viteRenderAssets("head-prepend"))}<meta charset=UTF-8><link rel=icon type=image/png sizes=32x32${_$.attr("href", _faviconPng)}><meta name=viewport content="width=device-width, initial-scale=1.0"><meta name=description content="A basic Marko app."><title>${_$.escapeXML(_$.$global().meta.pageTitle || "Marko")}</title>${_$.toString(_$.$global().___viteRenderAssets("head"))}</head><body>${_$.toString(_$.$global().___viteRenderAssets("body-prepend"))}`);
  _$.dynamicTag($scope0_id, 5, input.content, {}, 0, 0, _$.serializeGuard($serialize, 0));
  _$.write(_$.toString(_$.$global().___viteRenderAssets("body"))), _$.writeTrailers("</body></html>");
  _$.serializeGuard($serialize, 0) && _$.writeScope($scope0_id, {});
});

const _logoSvg = "data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20width='512'%20viewBox='0%200%202560%201400'%3e%3cpath%20fill='url(%23a)'%20d='M427%200h361L361%20697l427%20697H427L0%20698z'%20/%3e%3clinearGradient%20id='a'%20x2='0'%20y2='1'%3e%3cstop%20offset='0'%20stop-color='hsl(181,%2096.3%25,%2038.8%25)'%20/%3e%3cstop%20offset='.25'%20stop-color='hsl(186,%2094.9%25,%2046.1%25)'%20/%3e%3cstop%20offset='.5'%20stop-color='hsl(191,%2093.3%25,%2060.8%25)'%20/%3e%3cstop%20offset='.5'%20stop-color='hsl(195,%2094.3%25,%2050.8%25)'%20/%3e%3cstop%20offset='.75'%20stop-color='hsl(199,%2095.9%25,%2048.0%25)'%20/%3e%3cstop%20offset='1'%20stop-color='hsl(203,%2094.9%25,%2038.6%25)'%20/%3e%3c/linearGradient%3e%3cpath%20fill='url(%23b)'%20d='M854%20697h361L788%200H427z'%20/%3e%3clinearGradient%20id='b'%20x2='0'%20y2='1'%3e%3cstop%20offset='0'%20stop-color='hsl(170,%2080.3%25,%2050.8%25)'%20/%3e%3cstop%20offset='.5'%20stop-color='hsl(161,%2079.1%25,%2047.3%25)'%20/%3e%3cstop%20offset='1'%20stop-color='hsl(157,%2078.1%25,%2038.9%25)'%20/%3e%3c/linearGradient%3e%3cpath%20fill='url(%23c)'%20d='M1281%200h361l-427%20697H854z'%20/%3e%3clinearGradient%20id='c'%20x2='0'%20y2='1'%3e%3cstop%20offset='0'%20stop-color='hsl(86,%2095.9%25,%2037.1%25)'%20/%3e%3cstop%20offset='.5'%20stop-color='hsl(86,%2091.9%25,%2045.0%25)'%20/%3e%3cstop%20offset='1'%20stop-color='hsl(90,%2082.1%25,%2051.2%25)'%20/%3e%3c/linearGradient%3e%3cpath%20fill='url(%23d)'%20d='M1642%200h-361l428%20697-428%20697h361l428-697z'%20/%3e%3clinearGradient%20id='d'%20x2='0'%20y2='1'%3e%3cstop%20offset='0'%20stop-color='hsl(55,%2099.9%25,%2053.1%25)'%20/%3e%3cstop%20offset='.25'%20stop-color='hsl(51,%2099.9%25,%2050.0%25)'%20/%3e%3cstop%20offset='.5'%20stop-color='hsl(47,%2099.2%25,%2049.8%25)'%20/%3e%3cstop%20offset='.5'%20stop-color='hsl(39,%2099.9%25,%2050.0%25)'%20/%3e%3cstop%20offset='.75'%20stop-color='hsl(35,%2099.9%25,%2050.0%25)'%20/%3e%3cstop%20offset='1'%20stop-color='hsl(29,%2099.9%25,%2046.9%25)'%20/%3e%3c/linearGradient%3e%3cpath%20fill='url(%23e)'%20d='M2132%200h-361l427%20697-428%20697h361l428-697z'%20/%3e%3clinearGradient%20id='e'%20x2='0'%20y2='1'%3e%3cstop%20offset='0'%20stop-color='hsl(352,%2099.9%25,%2062.9%25)'%20/%3e%3cstop%20offset='.25'%20stop-color='hsl(345,%2090.3%25,%2051.8%25)'%20/%3e%3cstop%20offset='.5'%20stop-color='hsl(341,%2088.3%25,%2051.8%25)'%20/%3e%3cstop%20offset='.5'%20stop-color='hsl(336,%2080.9%25,%2045.4%25)'%20/%3e%3cstop%20offset='.75'%20stop-color='hsl(332,%2080.3%25,%2044.8%25)'%20/%3e%3cstop%20offset='1.1'%20stop-color='hsl(328,%2078.1%25,%2035.9%25)'%20/%3e%3c/linearGradient%3e%3c/svg%3e";

const _mouseMask = _$.createTemplate("c", input => {
  const $scope0_id = _$.nextScopeId();
  let x = "center";
  let y = "center";
  _$.write(`<div${_$.styleAttr(`--mouse-x:${x};--mouse-y:${y};`)} class=mouse-mask></div>${_$.markResumeNode($scope0_id, 0)}`);
  _$.writeEffect($scope0_id, "c0");
  _$.writeScope($scope0_id, {
    1: x,
    2: y
  });
  _$.resumeClosestBranch($scope0_id);
});

const Page$1 = _$.createTemplate("b", input => {
  _$.nextScopeId();
  _$.write(`<div class=container><header><img${_$.attr("src", _logoSvg)} alt=Marko class=logo></header><main><p>Edit <code>./src/routes/+page.marko</code> and save to reload.</p><div class=links><a href=https://markojs.com/docs/getting-started>Learn Marko</a><a href=/stream class=stream-link>🚀 Try Streaming Route</a></div></main></div>`);
  _mouseMask({});
});

const Template$1 = _$.createTemplate("QZ$ez5e", input => {
  _$.nextScopeId();
  Layout1({
    content: _$.createContent("FwlMKtk", () => {
      _$.nextScopeId();
      Page$1({});
    })
  });
});

const base = "/";
function getPrepend(g) {
  return g.___viteRenderAssets("head-prepend") + g.___viteRenderAssets("head") + g.___viteRenderAssets("body-prepend");
}
function getAppend(g) {
  return g.___viteRenderAssets("body-prepend");
}
function addAssets(g, newEntries) {
  const entries = g.___viteEntries;
  if (entries) {
    g.___viteEntries = entries.concat(newEntries);
    return true;
  }
  g.___viteEntries = newEntries;
  g.___viteRenderAssets = renderAssets;
  g.___viteInjectAttrs = g.cspNonce ? ` nonce="${g.cspNonce.replace(/"/g, "&#39;")}"` : "";
  g.___viteSeenIds = /* @__PURE__ */ new Set();
}
function renderAssets(slot) {
  const entries = this.___viteEntries;
  let html = "";
  if (entries) {
    const seenIds = this.___viteSeenIds;
    const slotWrittenEntriesKey = `___viteWrittenEntries-${slot}`;
    const lastWrittenEntry = this[slotWrittenEntriesKey] || 0;
    const writtenEntries = this[slotWrittenEntriesKey] = entries.length;
    for (let i = lastWrittenEntry; i < writtenEntries; i++) {
      let entry = entries[i];
      if (typeof entry === "string") {
        entry = __MARKO_MANIFEST__[entry] || {};
      }
      const parts = entry[slot];
      if (parts) {
        for (let i2 = 0; i2 < parts.length; i2++) {
          const part = parts[i2];
          switch (part) {
            case 0:
              html += this.___viteInjectAttrs;
              break;
            case 1:
              html += base;
              break;
            case 2: {
              const id = parts[++i2];
              const skipParts = parts[++i2];
              if (seenIds.has(id)) {
                i2 += skipParts;
              } else {
                seenIds.add(id);
              }
              break;
            }
            default:
              html += part;
              break;
          }
        }
      }
    }
  }
  return html;
}

function flush$1($global, html) {
  return getPrepend($global) + html + getAppend($global);
}
_$.register(flush$1, "dluCvn$");
function setFlush$1($global) {
  $global.__flush__ = flush$1;
}
_$.register(setFlush$1, "QCMZp$x");
const page$1 = _$.createTemplate("eZDrr4q", input => {
  _$.nextScopeId();
  const writeSync = addAssets(_$.$global(), ["route_5lM3"]) || setFlush$1(_$.$global());
  _$.write(_$.toString(writeSync && getPrepend(_$.$global())));
  Template$1({});
  _$.write(_$.toString(writeSync && getAppend(_$.$global())));
});

const pageTitle$1 = "Welcome to Marko";
const meta1 = {
  pageTitle: pageTitle$1,
};

// virtual:marko-run__marko-run__route.js

function get1(context) {
	return context.render(page$1, {});
}

function head1(context) {
	return stripResponseBody(get1(context));
}

const GET = (context) => {
  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control",
  };

  // Create a readable stream for Server-Sent Events
  const stream = new ReadableStream({
    start(controller) {
      let messageCount = 0;
      let interval;

      // Function to send a message
      const sendMessage = () => {
        messageCount++;
        const timestamp = new Date().toISOString();
        const data = {
          id: messageCount,
          timestamp,
          message: `Hello from streaming route! Message #${messageCount}`,
          randomValue: Math.floor(Math.random() * 100),
        };

        // Format as Server-Sent Event
        const eventData = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(new TextEncoder().encode(eventData));
      };

      // Send initial message
      sendMessage();

      // Send a message every 2 seconds
      interval = setInterval(() => {
        try {
          sendMessage();
        } catch (error) {
          // Client disconnected, clean up
          clearInterval(interval);
          try {
            controller.close();
          } catch (e) {
            // Already closed
          }
        }
      }, 2000);

      // Optional: Stop after 30 seconds to prevent infinite streams
      setTimeout(() => {
        clearInterval(interval);
        try {
          const finalData = `data: ${JSON.stringify({
            message: "Stream ended",
            final: true,
          })}\n\n`;
          controller.enqueue(new TextEncoder().encode(finalData));
          controller.close();
        } catch (error) {
          // Stream already closed
        }
      }, 30000);
    },
  });

  return new Response(stream, { headers });
};

const Page = _$.createTemplate("d", input => {
  const $scope0_id = _$.nextScopeId();
  _$.write("<div class=stream-container><header><h1>Streaming Route Demo</h1><p>Real-time server-sent events from <code>/stream</code></p></header><main><div class=controls><button id=startBtn onclick=startStream()>Start Stream</button><button id=stopBtn onclick=stopStream() disabled>Stop Stream</button><button id=clearBtn onclick=clearMessages()>Clear Messages</button></div><div class=status><span id=status>Disconnected</span><span id=messageCount>Messages: 0</span></div><div class=messages id=messages><p class=info>Click \"Start Stream\" to begin receiving real-time updates</p></div></main></div>");
  _$.writeEffect($scope0_id, "d0");
});

const Template = _$.createTemplate("DOhHpKB", input => {
  _$.nextScopeId();
  Layout1({
    content: _$.createContent("GWKRo4C", () => {
      _$.nextScopeId();
      Page({});
    })
  });
});

function flush($global, html) {
  return getPrepend($global) + html + getAppend($global);
}
_$.register(flush, "ehjJFxj");
function setFlush($global) {
  $global.__flush__ = flush;
}
_$.register(setFlush, "Lip8xIK");
const page = _$.createTemplate("KluyIuw", input => {
  _$.nextScopeId();
  const writeSync = addAssets(_$.$global(), ["route_XpU7"]) || setFlush(_$.$global());
  _$.write(_$.toString(writeSync && getPrepend(_$.$global())));
  Template({});
  _$.write(_$.toString(writeSync && getAppend(_$.$global())));
});

const pageTitle = "Streaming Route Demo - Real-time Server-Sent Events";
const meta2 = {
  pageTitle,
};

// virtual:marko-run__marko-run__stream.route.js

const getHandler = normalize(GET);

function get2(context) {
	const __page = () => context.render(page, {});
	return call(getHandler, __page, context);
}

function head2(context) {
	return stripResponseBody(get2(context));
}

globalThis.__marko_run__ = { match, fetch, invoke };
function match(method, pathname) {
  const last = pathname.length - 1;
  return match_internal(method, last && pathname.charAt(last) === "/" ? pathname.slice(0, last) : pathname);
}
function match_internal(method, pathname) {
  const len = pathname.length;
  switch (method) {
    case "GET":
    case "get": {
      if (len === 1) return { handler: get1, params: {}, meta: meta1, path: "/" };
      const i1 = pathname.indexOf("/", 1) + 1;
      if (!i1 || i1 === len) {
        if (pathname.slice(1, i1 ? -1 : len) === "stream") return { handler: get2, params: {}, meta: meta2, path: "/stream" };
      }
      return null;
    }
    case "HEAD":
    case "head": {
      if (len === 1) return { handler: head1, params: {}, meta: meta1, path: "/" };
      const i1 = pathname.indexOf("/", 1) + 1;
      if (!i1 || i1 === len) {
        if (pathname.slice(1, i1 ? -1 : len) === "stream") return { handler: head2, params: {}, meta: meta2, path: "/stream" };
      }
      return null;
    }
  }
  return null;
}
async function invoke(route, request, platform, url) {
  const context = createContext(route, request, platform, url);
  if (route) {
    try {
      const response = await route.handler(context);
      if (response) return response;
    } catch (error) {
      if (error === NotHandled) return;
      if (error !== NotMatched) throw error;
    }
  }
  return new Response(null, {
    status: 404
  });
}
async function fetch(request, platform) {
  try {
    const url = new URL(request.url);
    const { pathname } = url;
    const last = pathname.length - 1;
    const hasTrailingSlash = last && pathname.charAt(last) === "/";
    const normalizedPathname = hasTrailingSlash ? pathname.slice(0, last) : pathname;
    const route = match_internal(request.method, normalizedPathname);
    if (route && hasTrailingSlash) {
      url.pathname = normalizedPathname;
      return Response.redirect(url);
    }
    return await invoke(route, request, platform, url);
  } catch (error) {
    return new Response(null, {
      status: 500
    });
  }
}

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

function getAugmentedNamespace(n) {
  if (Object.prototype.hasOwnProperty.call(n, '__esModule')) return n;
  var f = n.default;
	if (typeof f == "function") {
		var a = function a () {
			if (this instanceof a) {
        return Reflect.construct(f, arguments, this.constructor);
			}
			return f.apply(this, arguments);
		};
		a.prototype = f.prototype;
  } else a = {};
  Object.defineProperty(a, '__esModule', {value: true});
	Object.keys(n).forEach(function (k) {
		var d = Object.getOwnPropertyDescriptor(n, k);
		Object.defineProperty(a, k, d.get ? d : {
			enumerable: true,
			get: function () {
				return n[k];
			}
		});
	});
	return a;
}

var compression$1 = {exports: {}};

var negotiator = {exports: {}};

var charset = {exports: {}};

/**
 * negotiator
 * Copyright(c) 2012 Isaac Z. Schlueter
 * Copyright(c) 2014 Federico Romero
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

var hasRequiredCharset;

function requireCharset () {
	if (hasRequiredCharset) return charset.exports;
	hasRequiredCharset = 1;

	/**
	 * Module exports.
	 * @public
	 */

	charset.exports = preferredCharsets;
	charset.exports.preferredCharsets = preferredCharsets;

	/**
	 * Module variables.
	 * @private
	 */

	var simpleCharsetRegExp = /^\s*([^\s;]+)\s*(?:;(.*))?$/;

	/**
	 * Parse the Accept-Charset header.
	 * @private
	 */

	function parseAcceptCharset(accept) {
	  var accepts = accept.split(',');

	  for (var i = 0, j = 0; i < accepts.length; i++) {
	    var charset = parseCharset(accepts[i].trim(), i);

	    if (charset) {
	      accepts[j++] = charset;
	    }
	  }

	  // trim accepts
	  accepts.length = j;

	  return accepts;
	}

	/**
	 * Parse a charset from the Accept-Charset header.
	 * @private
	 */

	function parseCharset(str, i) {
	  var match = simpleCharsetRegExp.exec(str);
	  if (!match) return null;

	  var charset = match[1];
	  var q = 1;
	  if (match[2]) {
	    var params = match[2].split(';');
	    for (var j = 0; j < params.length; j++) {
	      var p = params[j].trim().split('=');
	      if (p[0] === 'q') {
	        q = parseFloat(p[1]);
	        break;
	      }
	    }
	  }

	  return {
	    charset: charset,
	    q: q,
	    i: i
	  };
	}

	/**
	 * Get the priority of a charset.
	 * @private
	 */

	function getCharsetPriority(charset, accepted, index) {
	  var priority = {o: -1, q: 0, s: 0};

	  for (var i = 0; i < accepted.length; i++) {
	    var spec = specify(charset, accepted[i], index);

	    if (spec && (priority.s - spec.s || priority.q - spec.q || priority.o - spec.o) < 0) {
	      priority = spec;
	    }
	  }

	  return priority;
	}

	/**
	 * Get the specificity of the charset.
	 * @private
	 */

	function specify(charset, spec, index) {
	  var s = 0;
	  if(spec.charset.toLowerCase() === charset.toLowerCase()){
	    s |= 1;
	  } else if (spec.charset !== '*' ) {
	    return null
	  }

	  return {
	    i: index,
	    o: spec.i,
	    q: spec.q,
	    s: s
	  }
	}

	/**
	 * Get the preferred charsets from an Accept-Charset header.
	 * @public
	 */

	function preferredCharsets(accept, provided) {
	  // RFC 2616 sec 14.2: no header = *
	  var accepts = parseAcceptCharset(accept === undefined ? '*' : accept || '');

	  if (!provided) {
	    // sorted list of all charsets
	    return accepts
	      .filter(isQuality)
	      .sort(compareSpecs)
	      .map(getFullCharset);
	  }

	  var priorities = provided.map(function getPriority(type, index) {
	    return getCharsetPriority(type, accepts, index);
	  });

	  // sorted list of accepted charsets
	  return priorities.filter(isQuality).sort(compareSpecs).map(function getCharset(priority) {
	    return provided[priorities.indexOf(priority)];
	  });
	}

	/**
	 * Compare two specs.
	 * @private
	 */

	function compareSpecs(a, b) {
	  return (b.q - a.q) || (b.s - a.s) || (a.o - b.o) || (a.i - b.i) || 0;
	}

	/**
	 * Get full charset string.
	 * @private
	 */

	function getFullCharset(spec) {
	  return spec.charset;
	}

	/**
	 * Check if a spec has any quality.
	 * @private
	 */

	function isQuality(spec) {
	  return spec.q > 0;
	}
	return charset.exports;
}

var encoding = {exports: {}};

/**
 * negotiator
 * Copyright(c) 2012 Isaac Z. Schlueter
 * Copyright(c) 2014 Federico Romero
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

var hasRequiredEncoding;

function requireEncoding () {
	if (hasRequiredEncoding) return encoding.exports;
	hasRequiredEncoding = 1;

	/**
	 * Module exports.
	 * @public
	 */

	encoding.exports = preferredEncodings;
	encoding.exports.preferredEncodings = preferredEncodings;

	/**
	 * Module variables.
	 * @private
	 */

	var simpleEncodingRegExp = /^\s*([^\s;]+)\s*(?:;(.*))?$/;

	/**
	 * Parse the Accept-Encoding header.
	 * @private
	 */

	function parseAcceptEncoding(accept) {
	  var accepts = accept.split(',');
	  var hasIdentity = false;
	  var minQuality = 1;

	  for (var i = 0, j = 0; i < accepts.length; i++) {
	    var encoding = parseEncoding(accepts[i].trim(), i);

	    if (encoding) {
	      accepts[j++] = encoding;
	      hasIdentity = hasIdentity || specify('identity', encoding);
	      minQuality = Math.min(minQuality, encoding.q || 1);
	    }
	  }

	  if (!hasIdentity) {
	    /*
	     * If identity doesn't explicitly appear in the accept-encoding header,
	     * it's added to the list of acceptable encoding with the lowest q
	     */
	    accepts[j++] = {
	      encoding: 'identity',
	      q: minQuality,
	      i: i
	    };
	  }

	  // trim accepts
	  accepts.length = j;

	  return accepts;
	}

	/**
	 * Parse an encoding from the Accept-Encoding header.
	 * @private
	 */

	function parseEncoding(str, i) {
	  var match = simpleEncodingRegExp.exec(str);
	  if (!match) return null;

	  var encoding = match[1];
	  var q = 1;
	  if (match[2]) {
	    var params = match[2].split(';');
	    for (var j = 0; j < params.length; j++) {
	      var p = params[j].trim().split('=');
	      if (p[0] === 'q') {
	        q = parseFloat(p[1]);
	        break;
	      }
	    }
	  }

	  return {
	    encoding: encoding,
	    q: q,
	    i: i
	  };
	}

	/**
	 * Get the priority of an encoding.
	 * @private
	 */

	function getEncodingPriority(encoding, accepted, index) {
	  var priority = {encoding: encoding, o: -1, q: 0, s: 0};

	  for (var i = 0; i < accepted.length; i++) {
	    var spec = specify(encoding, accepted[i], index);

	    if (spec && (priority.s - spec.s || priority.q - spec.q || priority.o - spec.o) < 0) {
	      priority = spec;
	    }
	  }

	  return priority;
	}

	/**
	 * Get the specificity of the encoding.
	 * @private
	 */

	function specify(encoding, spec, index) {
	  var s = 0;
	  if(spec.encoding.toLowerCase() === encoding.toLowerCase()){
	    s |= 1;
	  } else if (spec.encoding !== '*' ) {
	    return null
	  }

	  return {
	    encoding: encoding,
	    i: index,
	    o: spec.i,
	    q: spec.q,
	    s: s
	  }
	}
	/**
	 * Get the preferred encodings from an Accept-Encoding header.
	 * @public
	 */

	function preferredEncodings(accept, provided, preferred) {
	  var accepts = parseAcceptEncoding(accept || '');

	  var comparator = preferred ? function comparator (a, b) {
	    if (a.q !== b.q) {
	      return b.q - a.q // higher quality first
	    }

	    var aPreferred = preferred.indexOf(a.encoding);
	    var bPreferred = preferred.indexOf(b.encoding);

	    if (aPreferred === -1 && bPreferred === -1) {
	      // consider the original specifity/order
	      return (b.s - a.s) || (a.o - b.o) || (a.i - b.i)
	    }

	    if (aPreferred !== -1 && bPreferred !== -1) {
	      return aPreferred - bPreferred // consider the preferred order
	    }

	    return aPreferred === -1 ? 1 : -1 // preferred first
	  } : compareSpecs;

	  if (!provided) {
	    // sorted list of all encodings
	    return accepts
	      .filter(isQuality)
	      .sort(comparator)
	      .map(getFullEncoding);
	  }

	  var priorities = provided.map(function getPriority(type, index) {
	    return getEncodingPriority(type, accepts, index);
	  });

	  // sorted list of accepted encodings
	  return priorities.filter(isQuality).sort(comparator).map(function getEncoding(priority) {
	    return provided[priorities.indexOf(priority)];
	  });
	}

	/**
	 * Compare two specs.
	 * @private
	 */

	function compareSpecs(a, b) {
	  return (b.q - a.q) || (b.s - a.s) || (a.o - b.o) || (a.i - b.i);
	}

	/**
	 * Get full encoding string.
	 * @private
	 */

	function getFullEncoding(spec) {
	  return spec.encoding;
	}

	/**
	 * Check if a spec has any quality.
	 * @private
	 */

	function isQuality(spec) {
	  return spec.q > 0;
	}
	return encoding.exports;
}

var language = {exports: {}};

/**
 * negotiator
 * Copyright(c) 2012 Isaac Z. Schlueter
 * Copyright(c) 2014 Federico Romero
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

var hasRequiredLanguage;

function requireLanguage () {
	if (hasRequiredLanguage) return language.exports;
	hasRequiredLanguage = 1;

	/**
	 * Module exports.
	 * @public
	 */

	language.exports = preferredLanguages;
	language.exports.preferredLanguages = preferredLanguages;

	/**
	 * Module variables.
	 * @private
	 */

	var simpleLanguageRegExp = /^\s*([^\s\-;]+)(?:-([^\s;]+))?\s*(?:;(.*))?$/;

	/**
	 * Parse the Accept-Language header.
	 * @private
	 */

	function parseAcceptLanguage(accept) {
	  var accepts = accept.split(',');

	  for (var i = 0, j = 0; i < accepts.length; i++) {
	    var language = parseLanguage(accepts[i].trim(), i);

	    if (language) {
	      accepts[j++] = language;
	    }
	  }

	  // trim accepts
	  accepts.length = j;

	  return accepts;
	}

	/**
	 * Parse a language from the Accept-Language header.
	 * @private
	 */

	function parseLanguage(str, i) {
	  var match = simpleLanguageRegExp.exec(str);
	  if (!match) return null;

	  var prefix = match[1];
	  var suffix = match[2];
	  var full = prefix;

	  if (suffix) full += "-" + suffix;

	  var q = 1;
	  if (match[3]) {
	    var params = match[3].split(';');
	    for (var j = 0; j < params.length; j++) {
	      var p = params[j].split('=');
	      if (p[0] === 'q') q = parseFloat(p[1]);
	    }
	  }

	  return {
	    prefix: prefix,
	    suffix: suffix,
	    q: q,
	    i: i,
	    full: full
	  };
	}

	/**
	 * Get the priority of a language.
	 * @private
	 */

	function getLanguagePriority(language, accepted, index) {
	  var priority = {o: -1, q: 0, s: 0};

	  for (var i = 0; i < accepted.length; i++) {
	    var spec = specify(language, accepted[i], index);

	    if (spec && (priority.s - spec.s || priority.q - spec.q || priority.o - spec.o) < 0) {
	      priority = spec;
	    }
	  }

	  return priority;
	}

	/**
	 * Get the specificity of the language.
	 * @private
	 */

	function specify(language, spec, index) {
	  var p = parseLanguage(language);
	  if (!p) return null;
	  var s = 0;
	  if(spec.full.toLowerCase() === p.full.toLowerCase()){
	    s |= 4;
	  } else if (spec.prefix.toLowerCase() === p.full.toLowerCase()) {
	    s |= 2;
	  } else if (spec.full.toLowerCase() === p.prefix.toLowerCase()) {
	    s |= 1;
	  } else if (spec.full !== '*' ) {
	    return null
	  }

	  return {
	    i: index,
	    o: spec.i,
	    q: spec.q,
	    s: s
	  }
	}
	/**
	 * Get the preferred languages from an Accept-Language header.
	 * @public
	 */

	function preferredLanguages(accept, provided) {
	  // RFC 2616 sec 14.4: no header = *
	  var accepts = parseAcceptLanguage(accept === undefined ? '*' : accept || '');

	  if (!provided) {
	    // sorted list of all languages
	    return accepts
	      .filter(isQuality)
	      .sort(compareSpecs)
	      .map(getFullLanguage);
	  }

	  var priorities = provided.map(function getPriority(type, index) {
	    return getLanguagePriority(type, accepts, index);
	  });

	  // sorted list of accepted languages
	  return priorities.filter(isQuality).sort(compareSpecs).map(function getLanguage(priority) {
	    return provided[priorities.indexOf(priority)];
	  });
	}

	/**
	 * Compare two specs.
	 * @private
	 */

	function compareSpecs(a, b) {
	  return (b.q - a.q) || (b.s - a.s) || (a.o - b.o) || (a.i - b.i) || 0;
	}

	/**
	 * Get full language string.
	 * @private
	 */

	function getFullLanguage(spec) {
	  return spec.full;
	}

	/**
	 * Check if a spec has any quality.
	 * @private
	 */

	function isQuality(spec) {
	  return spec.q > 0;
	}
	return language.exports;
}

var mediaType = {exports: {}};

/**
 * negotiator
 * Copyright(c) 2012 Isaac Z. Schlueter
 * Copyright(c) 2014 Federico Romero
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

var hasRequiredMediaType;

function requireMediaType () {
	if (hasRequiredMediaType) return mediaType.exports;
	hasRequiredMediaType = 1;

	/**
	 * Module exports.
	 * @public
	 */

	mediaType.exports = preferredMediaTypes;
	mediaType.exports.preferredMediaTypes = preferredMediaTypes;

	/**
	 * Module variables.
	 * @private
	 */

	var simpleMediaTypeRegExp = /^\s*([^\s\/;]+)\/([^;\s]+)\s*(?:;(.*))?$/;

	/**
	 * Parse the Accept header.
	 * @private
	 */

	function parseAccept(accept) {
	  var accepts = splitMediaTypes(accept);

	  for (var i = 0, j = 0; i < accepts.length; i++) {
	    var mediaType = parseMediaType(accepts[i].trim(), i);

	    if (mediaType) {
	      accepts[j++] = mediaType;
	    }
	  }

	  // trim accepts
	  accepts.length = j;

	  return accepts;
	}

	/**
	 * Parse a media type from the Accept header.
	 * @private
	 */

	function parseMediaType(str, i) {
	  var match = simpleMediaTypeRegExp.exec(str);
	  if (!match) return null;

	  var params = Object.create(null);
	  var q = 1;
	  var subtype = match[2];
	  var type = match[1];

	  if (match[3]) {
	    var kvps = splitParameters(match[3]).map(splitKeyValuePair);

	    for (var j = 0; j < kvps.length; j++) {
	      var pair = kvps[j];
	      var key = pair[0].toLowerCase();
	      var val = pair[1];

	      // get the value, unwrapping quotes
	      var value = val && val[0] === '"' && val[val.length - 1] === '"'
	        ? val.slice(1, -1)
	        : val;

	      if (key === 'q') {
	        q = parseFloat(value);
	        break;
	      }

	      // store parameter
	      params[key] = value;
	    }
	  }

	  return {
	    type: type,
	    subtype: subtype,
	    params: params,
	    q: q,
	    i: i
	  };
	}

	/**
	 * Get the priority of a media type.
	 * @private
	 */

	function getMediaTypePriority(type, accepted, index) {
	  var priority = {o: -1, q: 0, s: 0};

	  for (var i = 0; i < accepted.length; i++) {
	    var spec = specify(type, accepted[i], index);

	    if (spec && (priority.s - spec.s || priority.q - spec.q || priority.o - spec.o) < 0) {
	      priority = spec;
	    }
	  }

	  return priority;
	}

	/**
	 * Get the specificity of the media type.
	 * @private
	 */

	function specify(type, spec, index) {
	  var p = parseMediaType(type);
	  var s = 0;

	  if (!p) {
	    return null;
	  }

	  if(spec.type.toLowerCase() == p.type.toLowerCase()) {
	    s |= 4;
	  } else if(spec.type != '*') {
	    return null;
	  }

	  if(spec.subtype.toLowerCase() == p.subtype.toLowerCase()) {
	    s |= 2;
	  } else if(spec.subtype != '*') {
	    return null;
	  }

	  var keys = Object.keys(spec.params);
	  if (keys.length > 0) {
	    if (keys.every(function (k) {
	      return spec.params[k] == '*' || (spec.params[k] || '').toLowerCase() == (p.params[k] || '').toLowerCase();
	    })) {
	      s |= 1;
	    } else {
	      return null
	    }
	  }

	  return {
	    i: index,
	    o: spec.i,
	    q: spec.q,
	    s: s,
	  }
	}

	/**
	 * Get the preferred media types from an Accept header.
	 * @public
	 */

	function preferredMediaTypes(accept, provided) {
	  // RFC 2616 sec 14.2: no header = */*
	  var accepts = parseAccept(accept === undefined ? '*/*' : accept || '');

	  if (!provided) {
	    // sorted list of all types
	    return accepts
	      .filter(isQuality)
	      .sort(compareSpecs)
	      .map(getFullType);
	  }

	  var priorities = provided.map(function getPriority(type, index) {
	    return getMediaTypePriority(type, accepts, index);
	  });

	  // sorted list of accepted types
	  return priorities.filter(isQuality).sort(compareSpecs).map(function getType(priority) {
	    return provided[priorities.indexOf(priority)];
	  });
	}

	/**
	 * Compare two specs.
	 * @private
	 */

	function compareSpecs(a, b) {
	  return (b.q - a.q) || (b.s - a.s) || (a.o - b.o) || (a.i - b.i) || 0;
	}

	/**
	 * Get full type string.
	 * @private
	 */

	function getFullType(spec) {
	  return spec.type + '/' + spec.subtype;
	}

	/**
	 * Check if a spec has any quality.
	 * @private
	 */

	function isQuality(spec) {
	  return spec.q > 0;
	}

	/**
	 * Count the number of quotes in a string.
	 * @private
	 */

	function quoteCount(string) {
	  var count = 0;
	  var index = 0;

	  while ((index = string.indexOf('"', index)) !== -1) {
	    count++;
	    index++;
	  }

	  return count;
	}

	/**
	 * Split a key value pair.
	 * @private
	 */

	function splitKeyValuePair(str) {
	  var index = str.indexOf('=');
	  var key;
	  var val;

	  if (index === -1) {
	    key = str;
	  } else {
	    key = str.slice(0, index);
	    val = str.slice(index + 1);
	  }

	  return [key, val];
	}

	/**
	 * Split an Accept header into media types.
	 * @private
	 */

	function splitMediaTypes(accept) {
	  var accepts = accept.split(',');

	  for (var i = 1, j = 0; i < accepts.length; i++) {
	    if (quoteCount(accepts[j]) % 2 == 0) {
	      accepts[++j] = accepts[i];
	    } else {
	      accepts[j] += ',' + accepts[i];
	    }
	  }

	  // trim accepts
	  accepts.length = j + 1;

	  return accepts;
	}

	/**
	 * Split a string of parameters.
	 * @private
	 */

	function splitParameters(str) {
	  var parameters = str.split(';');

	  for (var i = 1, j = 0; i < parameters.length; i++) {
	    if (quoteCount(parameters[j]) % 2 == 0) {
	      parameters[++j] = parameters[i];
	    } else {
	      parameters[j] += ';' + parameters[i];
	    }
	  }

	  // trim parameters
	  parameters.length = j + 1;

	  for (var i = 0; i < parameters.length; i++) {
	    parameters[i] = parameters[i].trim();
	  }

	  return parameters;
	}
	return mediaType.exports;
}

/*!
 * negotiator
 * Copyright(c) 2012 Federico Romero
 * Copyright(c) 2012-2014 Isaac Z. Schlueter
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */

var hasRequiredNegotiator;

function requireNegotiator () {
	if (hasRequiredNegotiator) return negotiator.exports;
	hasRequiredNegotiator = 1;

	var preferredCharsets = requireCharset();
	var preferredEncodings = requireEncoding();
	var preferredLanguages = requireLanguage();
	var preferredMediaTypes = requireMediaType();

	/**
	 * Module exports.
	 * @public
	 */

	negotiator.exports = Negotiator;
	negotiator.exports.Negotiator = Negotiator;

	/**
	 * Create a Negotiator instance from a request.
	 * @param {object} request
	 * @public
	 */

	function Negotiator(request) {
	  if (!(this instanceof Negotiator)) {
	    return new Negotiator(request);
	  }

	  this.request = request;
	}

	Negotiator.prototype.charset = function charset(available) {
	  var set = this.charsets(available);
	  return set && set[0];
	};

	Negotiator.prototype.charsets = function charsets(available) {
	  return preferredCharsets(this.request.headers['accept-charset'], available);
	};

	Negotiator.prototype.encoding = function encoding(available, preferred) {
	  var set = this.encodings(available, preferred);
	  return set && set[0];
	};

	Negotiator.prototype.encodings = function encodings(available, preferred) {
	  return preferredEncodings(this.request.headers['accept-encoding'], available, preferred);
	};

	Negotiator.prototype.language = function language(available) {
	  var set = this.languages(available);
	  return set && set[0];
	};

	Negotiator.prototype.languages = function languages(available) {
	  return preferredLanguages(this.request.headers['accept-language'], available);
	};

	Negotiator.prototype.mediaType = function mediaType(available) {
	  var set = this.mediaTypes(available);
	  return set && set[0];
	};

	Negotiator.prototype.mediaTypes = function mediaTypes(available) {
	  return preferredMediaTypes(this.request.headers.accept, available);
	};

	// Backwards compatibility
	Negotiator.prototype.preferredCharset = Negotiator.prototype.charset;
	Negotiator.prototype.preferredCharsets = Negotiator.prototype.charsets;
	Negotiator.prototype.preferredEncoding = Negotiator.prototype.encoding;
	Negotiator.prototype.preferredEncodings = Negotiator.prototype.encodings;
	Negotiator.prototype.preferredLanguage = Negotiator.prototype.language;
	Negotiator.prototype.preferredLanguages = Negotiator.prototype.languages;
	Negotiator.prototype.preferredMediaType = Negotiator.prototype.mediaType;
	Negotiator.prototype.preferredMediaTypes = Negotiator.prototype.mediaTypes;
	return negotiator.exports;
}

var safeBuffer = {exports: {}};

const require$$0$6 = /*@__PURE__*/getAugmentedNamespace(buffer);

/*! safe-buffer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */

var hasRequiredSafeBuffer;

function requireSafeBuffer () {
	if (hasRequiredSafeBuffer) return safeBuffer.exports;
	hasRequiredSafeBuffer = 1;
	(function (module, exports) {
		/* eslint-disable node/no-deprecated-api */
		var buffer = require$$0$6;
		var Buffer = buffer.Buffer;

		// alternative to using Object.keys for old browsers
		function copyProps (src, dst) {
		  for (var key in src) {
		    dst[key] = src[key];
		  }
		}
		if (Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow) {
		  module.exports = buffer;
		} else {
		  // Copy properties from require('buffer')
		  copyProps(buffer, exports);
		  exports.Buffer = SafeBuffer;
		}

		function SafeBuffer (arg, encodingOrOffset, length) {
		  return Buffer(arg, encodingOrOffset, length)
		}

		SafeBuffer.prototype = Object.create(Buffer.prototype);

		// Copy static methods from Buffer
		copyProps(Buffer, SafeBuffer);

		SafeBuffer.from = function (arg, encodingOrOffset, length) {
		  if (typeof arg === 'number') {
		    throw new TypeError('Argument must not be a number')
		  }
		  return Buffer(arg, encodingOrOffset, length)
		};

		SafeBuffer.alloc = function (size, fill, encoding) {
		  if (typeof size !== 'number') {
		    throw new TypeError('Argument must be a number')
		  }
		  var buf = Buffer(size);
		  if (fill !== undefined) {
		    if (typeof encoding === 'string') {
		      buf.fill(fill, encoding);
		    } else {
		      buf.fill(fill);
		    }
		  } else {
		    buf.fill(0);
		  }
		  return buf
		};

		SafeBuffer.allocUnsafe = function (size) {
		  if (typeof size !== 'number') {
		    throw new TypeError('Argument must be a number')
		  }
		  return Buffer(size)
		};

		SafeBuffer.allocUnsafeSlow = function (size) {
		  if (typeof size !== 'number') {
		    throw new TypeError('Argument must be a number')
		  }
		  return buffer.SlowBuffer(size)
		}; 
	} (safeBuffer, safeBuffer.exports));
	return safeBuffer.exports;
}

var bytes = {exports: {}};

/*!
 * bytes
 * Copyright(c) 2012-2014 TJ Holowaychuk
 * Copyright(c) 2015 Jed Watson
 * MIT Licensed
 */

var hasRequiredBytes;

function requireBytes () {
	if (hasRequiredBytes) return bytes.exports;
	hasRequiredBytes = 1;

	/**
	 * Module exports.
	 * @public
	 */

	bytes.exports = bytes$1;
	bytes.exports.format = format;
	bytes.exports.parse = parse;

	/**
	 * Module variables.
	 * @private
	 */

	var formatThousandsRegExp = /\B(?=(\d{3})+(?!\d))/g;

	var formatDecimalsRegExp = /(?:\.0*|(\.[^0]+)0+)$/;

	var map = {
	  b:  1,
	  kb: 1 << 10,
	  mb: 1 << 20,
	  gb: 1 << 30,
	  tb: Math.pow(1024, 4),
	  pb: Math.pow(1024, 5),
	};

	var parseRegExp = /^((-|\+)?(\d+(?:\.\d+)?)) *(kb|mb|gb|tb|pb)$/i;

	/**
	 * Convert the given value in bytes into a string or parse to string to an integer in bytes.
	 *
	 * @param {string|number} value
	 * @param {{
	 *  case: [string],
	 *  decimalPlaces: [number]
	 *  fixedDecimals: [boolean]
	 *  thousandsSeparator: [string]
	 *  unitSeparator: [string]
	 *  }} [options] bytes options.
	 *
	 * @returns {string|number|null}
	 */

	function bytes$1(value, options) {
	  if (typeof value === 'string') {
	    return parse(value);
	  }

	  if (typeof value === 'number') {
	    return format(value, options);
	  }

	  return null;
	}

	/**
	 * Format the given value in bytes into a string.
	 *
	 * If the value is negative, it is kept as such. If it is a float,
	 * it is rounded.
	 *
	 * @param {number} value
	 * @param {object} [options]
	 * @param {number} [options.decimalPlaces=2]
	 * @param {number} [options.fixedDecimals=false]
	 * @param {string} [options.thousandsSeparator=]
	 * @param {string} [options.unit=]
	 * @param {string} [options.unitSeparator=]
	 *
	 * @returns {string|null}
	 * @public
	 */

	function format(value, options) {
	  if (!Number.isFinite(value)) {
	    return null;
	  }

	  var mag = Math.abs(value);
	  var thousandsSeparator = (options && options.thousandsSeparator) || '';
	  var unitSeparator = (options && options.unitSeparator) || '';
	  var decimalPlaces = (options && options.decimalPlaces !== undefined) ? options.decimalPlaces : 2;
	  var fixedDecimals = Boolean(options && options.fixedDecimals);
	  var unit = (options && options.unit) || '';

	  if (!unit || !map[unit.toLowerCase()]) {
	    if (mag >= map.pb) {
	      unit = 'PB';
	    } else if (mag >= map.tb) {
	      unit = 'TB';
	    } else if (mag >= map.gb) {
	      unit = 'GB';
	    } else if (mag >= map.mb) {
	      unit = 'MB';
	    } else if (mag >= map.kb) {
	      unit = 'KB';
	    } else {
	      unit = 'B';
	    }
	  }

	  var val = value / map[unit.toLowerCase()];
	  var str = val.toFixed(decimalPlaces);

	  if (!fixedDecimals) {
	    str = str.replace(formatDecimalsRegExp, '$1');
	  }

	  if (thousandsSeparator) {
	    str = str.split('.').map(function (s, i) {
	      return i === 0
	        ? s.replace(formatThousandsRegExp, thousandsSeparator)
	        : s
	    }).join('.');
	  }

	  return str + unitSeparator + unit;
	}

	/**
	 * Parse the string value into an integer in bytes.
	 *
	 * If no unit is given, it is assumed the value is in bytes.
	 *
	 * @param {number|string} val
	 *
	 * @returns {number|null}
	 * @public
	 */

	function parse(val) {
	  if (typeof val === 'number' && !isNaN(val)) {
	    return val;
	  }

	  if (typeof val !== 'string') {
	    return null;
	  }

	  // Test if the string passed is valid
	  var results = parseRegExp.exec(val);
	  var floatValue;
	  var unit = 'b';

	  if (!results) {
	    // Nothing could be extracted from the given string
	    floatValue = parseInt(val, 10);
	    unit = 'b';
	  } else {
	    // Retrieve the value and the unit
	    floatValue = parseFloat(results[1]);
	    unit = results[4].toLowerCase();
	  }

	  if (isNaN(floatValue)) {
	    return null;
	  }

	  return Math.floor(map[unit] * floatValue);
	}
	return bytes.exports;
}

const require$$0$5 = {
  "application/1d-interleaved-parityfec": {"source":"iana"},
  "application/3gpdash-qoe-report+xml": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/3gpp-ims+xml": {"source":"iana","compressible":true},
  "application/3gpphal+json": {"source":"iana","compressible":true},
  "application/3gpphalforms+json": {"source":"iana","compressible":true},
  "application/a2l": {"source":"iana"},
  "application/ace+cbor": {"source":"iana"},
  "application/ace+json": {"source":"iana","compressible":true},
  "application/ace-groupcomm+cbor": {"source":"iana"},
  "application/ace-trl+cbor": {"source":"iana"},
  "application/activemessage": {"source":"iana"},
  "application/activity+json": {"source":"iana","compressible":true},
  "application/aif+cbor": {"source":"iana"},
  "application/aif+json": {"source":"iana","compressible":true},
  "application/alto-cdni+json": {"source":"iana","compressible":true},
  "application/alto-cdnifilter+json": {"source":"iana","compressible":true},
  "application/alto-costmap+json": {"source":"iana","compressible":true},
  "application/alto-costmapfilter+json": {"source":"iana","compressible":true},
  "application/alto-directory+json": {"source":"iana","compressible":true},
  "application/alto-endpointcost+json": {"source":"iana","compressible":true},
  "application/alto-endpointcostparams+json": {"source":"iana","compressible":true},
  "application/alto-endpointprop+json": {"source":"iana","compressible":true},
  "application/alto-endpointpropparams+json": {"source":"iana","compressible":true},
  "application/alto-error+json": {"source":"iana","compressible":true},
  "application/alto-networkmap+json": {"source":"iana","compressible":true},
  "application/alto-networkmapfilter+json": {"source":"iana","compressible":true},
  "application/alto-propmap+json": {"source":"iana","compressible":true},
  "application/alto-propmapparams+json": {"source":"iana","compressible":true},
  "application/alto-tips+json": {"source":"iana","compressible":true},
  "application/alto-tipsparams+json": {"source":"iana","compressible":true},
  "application/alto-updatestreamcontrol+json": {"source":"iana","compressible":true},
  "application/alto-updatestreamparams+json": {"source":"iana","compressible":true},
  "application/aml": {"source":"iana"},
  "application/andrew-inset": {"source":"iana","extensions":["ez"]},
  "application/appinstaller": {"compressible":false,"extensions":["appinstaller"]},
  "application/applefile": {"source":"iana"},
  "application/applixware": {"source":"apache","extensions":["aw"]},
  "application/appx": {"compressible":false,"extensions":["appx"]},
  "application/appxbundle": {"compressible":false,"extensions":["appxbundle"]},
  "application/at+jwt": {"source":"iana"},
  "application/atf": {"source":"iana"},
  "application/atfx": {"source":"iana"},
  "application/atom+xml": {"source":"iana","compressible":true,"extensions":["atom"]},
  "application/atomcat+xml": {"source":"iana","compressible":true,"extensions":["atomcat"]},
  "application/atomdeleted+xml": {"source":"iana","compressible":true,"extensions":["atomdeleted"]},
  "application/atomicmail": {"source":"iana"},
  "application/atomsvc+xml": {"source":"iana","compressible":true,"extensions":["atomsvc"]},
  "application/atsc-dwd+xml": {"source":"iana","compressible":true,"extensions":["dwd"]},
  "application/atsc-dynamic-event-message": {"source":"iana"},
  "application/atsc-held+xml": {"source":"iana","compressible":true,"extensions":["held"]},
  "application/atsc-rdt+json": {"source":"iana","compressible":true},
  "application/atsc-rsat+xml": {"source":"iana","compressible":true,"extensions":["rsat"]},
  "application/atxml": {"source":"iana"},
  "application/auth-policy+xml": {"source":"iana","compressible":true},
  "application/automationml-aml+xml": {"source":"iana","compressible":true,"extensions":["aml"]},
  "application/automationml-amlx+zip": {"source":"iana","compressible":false,"extensions":["amlx"]},
  "application/bacnet-xdd+zip": {"source":"iana","compressible":false},
  "application/batch-smtp": {"source":"iana"},
  "application/bdoc": {"compressible":false,"extensions":["bdoc"]},
  "application/beep+xml": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/bufr": {"source":"iana"},
  "application/c2pa": {"source":"iana"},
  "application/calendar+json": {"source":"iana","compressible":true},
  "application/calendar+xml": {"source":"iana","compressible":true,"extensions":["xcs"]},
  "application/call-completion": {"source":"iana"},
  "application/cals-1840": {"source":"iana"},
  "application/captive+json": {"source":"iana","compressible":true},
  "application/cbor": {"source":"iana"},
  "application/cbor-seq": {"source":"iana"},
  "application/cccex": {"source":"iana"},
  "application/ccmp+xml": {"source":"iana","compressible":true},
  "application/ccxml+xml": {"source":"iana","compressible":true,"extensions":["ccxml"]},
  "application/cda+xml": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/cdfx+xml": {"source":"iana","compressible":true,"extensions":["cdfx"]},
  "application/cdmi-capability": {"source":"iana","extensions":["cdmia"]},
  "application/cdmi-container": {"source":"iana","extensions":["cdmic"]},
  "application/cdmi-domain": {"source":"iana","extensions":["cdmid"]},
  "application/cdmi-object": {"source":"iana","extensions":["cdmio"]},
  "application/cdmi-queue": {"source":"iana","extensions":["cdmiq"]},
  "application/cdni": {"source":"iana"},
  "application/ce+cbor": {"source":"iana"},
  "application/cea": {"source":"iana"},
  "application/cea-2018+xml": {"source":"iana","compressible":true},
  "application/cellml+xml": {"source":"iana","compressible":true},
  "application/cfw": {"source":"iana"},
  "application/cid-edhoc+cbor-seq": {"source":"iana"},
  "application/city+json": {"source":"iana","compressible":true},
  "application/city+json-seq": {"source":"iana"},
  "application/clr": {"source":"iana"},
  "application/clue+xml": {"source":"iana","compressible":true},
  "application/clue_info+xml": {"source":"iana","compressible":true},
  "application/cms": {"source":"iana"},
  "application/cnrp+xml": {"source":"iana","compressible":true},
  "application/coap-eap": {"source":"iana"},
  "application/coap-group+json": {"source":"iana","compressible":true},
  "application/coap-payload": {"source":"iana"},
  "application/commonground": {"source":"iana"},
  "application/concise-problem-details+cbor": {"source":"iana"},
  "application/conference-info+xml": {"source":"iana","compressible":true},
  "application/cose": {"source":"iana"},
  "application/cose-key": {"source":"iana"},
  "application/cose-key-set": {"source":"iana"},
  "application/cose-x509": {"source":"iana"},
  "application/cpl+xml": {"source":"iana","compressible":true,"extensions":["cpl"]},
  "application/csrattrs": {"source":"iana"},
  "application/csta+xml": {"source":"iana","compressible":true},
  "application/cstadata+xml": {"source":"iana","compressible":true},
  "application/csvm+json": {"source":"iana","compressible":true},
  "application/cu-seeme": {"source":"apache","extensions":["cu"]},
  "application/cwl": {"source":"iana","extensions":["cwl"]},
  "application/cwl+json": {"source":"iana","compressible":true},
  "application/cwl+yaml": {"source":"iana"},
  "application/cwt": {"source":"iana"},
  "application/cybercash": {"source":"iana"},
  "application/dart": {"compressible":true},
  "application/dash+xml": {"source":"iana","compressible":true,"extensions":["mpd"]},
  "application/dash-patch+xml": {"source":"iana","compressible":true,"extensions":["mpp"]},
  "application/dashdelta": {"source":"iana"},
  "application/davmount+xml": {"source":"iana","compressible":true,"extensions":["davmount"]},
  "application/dca-rft": {"source":"iana"},
  "application/dcd": {"source":"iana"},
  "application/dec-dx": {"source":"iana"},
  "application/dialog-info+xml": {"source":"iana","compressible":true},
  "application/dicom": {"source":"iana","extensions":["dcm"]},
  "application/dicom+json": {"source":"iana","compressible":true},
  "application/dicom+xml": {"source":"iana","compressible":true},
  "application/dii": {"source":"iana"},
  "application/dit": {"source":"iana"},
  "application/dns": {"source":"iana"},
  "application/dns+json": {"source":"iana","compressible":true},
  "application/dns-message": {"source":"iana"},
  "application/docbook+xml": {"source":"apache","compressible":true,"extensions":["dbk"]},
  "application/dots+cbor": {"source":"iana"},
  "application/dpop+jwt": {"source":"iana"},
  "application/dskpp+xml": {"source":"iana","compressible":true},
  "application/dssc+der": {"source":"iana","extensions":["dssc"]},
  "application/dssc+xml": {"source":"iana","compressible":true,"extensions":["xdssc"]},
  "application/dvcs": {"source":"iana"},
  "application/eat+cwt": {"source":"iana"},
  "application/eat+jwt": {"source":"iana"},
  "application/eat-bun+cbor": {"source":"iana"},
  "application/eat-bun+json": {"source":"iana","compressible":true},
  "application/eat-ucs+cbor": {"source":"iana"},
  "application/eat-ucs+json": {"source":"iana","compressible":true},
  "application/ecmascript": {"source":"apache","compressible":true,"extensions":["ecma"]},
  "application/edhoc+cbor-seq": {"source":"iana"},
  "application/edi-consent": {"source":"iana"},
  "application/edi-x12": {"source":"iana","compressible":false},
  "application/edifact": {"source":"iana","compressible":false},
  "application/efi": {"source":"iana"},
  "application/elm+json": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/elm+xml": {"source":"iana","compressible":true},
  "application/emergencycalldata.cap+xml": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/emergencycalldata.comment+xml": {"source":"iana","compressible":true},
  "application/emergencycalldata.control+xml": {"source":"iana","compressible":true},
  "application/emergencycalldata.deviceinfo+xml": {"source":"iana","compressible":true},
  "application/emergencycalldata.ecall.msd": {"source":"iana"},
  "application/emergencycalldata.legacyesn+json": {"source":"iana","compressible":true},
  "application/emergencycalldata.providerinfo+xml": {"source":"iana","compressible":true},
  "application/emergencycalldata.serviceinfo+xml": {"source":"iana","compressible":true},
  "application/emergencycalldata.subscriberinfo+xml": {"source":"iana","compressible":true},
  "application/emergencycalldata.veds+xml": {"source":"iana","compressible":true},
  "application/emma+xml": {"source":"iana","compressible":true,"extensions":["emma"]},
  "application/emotionml+xml": {"source":"iana","compressible":true,"extensions":["emotionml"]},
  "application/encaprtp": {"source":"iana"},
  "application/entity-statement+jwt": {"source":"iana"},
  "application/epp+xml": {"source":"iana","compressible":true},
  "application/epub+zip": {"source":"iana","compressible":false,"extensions":["epub"]},
  "application/eshop": {"source":"iana"},
  "application/exi": {"source":"iana","extensions":["exi"]},
  "application/expect-ct-report+json": {"source":"iana","compressible":true},
  "application/express": {"source":"iana","extensions":["exp"]},
  "application/fastinfoset": {"source":"iana"},
  "application/fastsoap": {"source":"iana"},
  "application/fdf": {"source":"iana","extensions":["fdf"]},
  "application/fdt+xml": {"source":"iana","compressible":true,"extensions":["fdt"]},
  "application/fhir+json": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/fhir+xml": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/fido.trusted-apps+json": {"compressible":true},
  "application/fits": {"source":"iana"},
  "application/flexfec": {"source":"iana"},
  "application/font-sfnt": {"source":"iana"},
  "application/font-tdpfr": {"source":"iana","extensions":["pfr"]},
  "application/font-woff": {"source":"iana","compressible":false},
  "application/framework-attributes+xml": {"source":"iana","compressible":true},
  "application/geo+json": {"source":"iana","compressible":true,"extensions":["geojson"]},
  "application/geo+json-seq": {"source":"iana"},
  "application/geopackage+sqlite3": {"source":"iana"},
  "application/geopose+json": {"source":"iana","compressible":true},
  "application/geoxacml+json": {"source":"iana","compressible":true},
  "application/geoxacml+xml": {"source":"iana","compressible":true},
  "application/gltf-buffer": {"source":"iana"},
  "application/gml+xml": {"source":"iana","compressible":true,"extensions":["gml"]},
  "application/gnap-binding-jws": {"source":"iana"},
  "application/gnap-binding-jwsd": {"source":"iana"},
  "application/gnap-binding-rotation-jws": {"source":"iana"},
  "application/gnap-binding-rotation-jwsd": {"source":"iana"},
  "application/gpx+xml": {"source":"apache","compressible":true,"extensions":["gpx"]},
  "application/grib": {"source":"iana"},
  "application/gxf": {"source":"apache","extensions":["gxf"]},
  "application/gzip": {"source":"iana","compressible":false,"extensions":["gz"]},
  "application/h224": {"source":"iana"},
  "application/held+xml": {"source":"iana","compressible":true},
  "application/hjson": {"extensions":["hjson"]},
  "application/hl7v2+xml": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/http": {"source":"iana"},
  "application/hyperstudio": {"source":"iana","extensions":["stk"]},
  "application/ibe-key-request+xml": {"source":"iana","compressible":true},
  "application/ibe-pkg-reply+xml": {"source":"iana","compressible":true},
  "application/ibe-pp-data": {"source":"iana"},
  "application/iges": {"source":"iana"},
  "application/im-iscomposing+xml": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/index": {"source":"iana"},
  "application/index.cmd": {"source":"iana"},
  "application/index.obj": {"source":"iana"},
  "application/index.response": {"source":"iana"},
  "application/index.vnd": {"source":"iana"},
  "application/inkml+xml": {"source":"iana","compressible":true,"extensions":["ink","inkml"]},
  "application/iotp": {"source":"iana"},
  "application/ipfix": {"source":"iana","extensions":["ipfix"]},
  "application/ipp": {"source":"iana"},
  "application/isup": {"source":"iana"},
  "application/its+xml": {"source":"iana","compressible":true,"extensions":["its"]},
  "application/java-archive": {"source":"iana","compressible":false,"extensions":["jar","war","ear"]},
  "application/java-serialized-object": {"source":"apache","compressible":false,"extensions":["ser"]},
  "application/java-vm": {"source":"apache","compressible":false,"extensions":["class"]},
  "application/javascript": {"source":"apache","charset":"UTF-8","compressible":true,"extensions":["js"]},
  "application/jf2feed+json": {"source":"iana","compressible":true},
  "application/jose": {"source":"iana"},
  "application/jose+json": {"source":"iana","compressible":true},
  "application/jrd+json": {"source":"iana","compressible":true},
  "application/jscalendar+json": {"source":"iana","compressible":true},
  "application/jscontact+json": {"source":"iana","compressible":true},
  "application/json": {"source":"iana","charset":"UTF-8","compressible":true,"extensions":["json","map"]},
  "application/json-patch+json": {"source":"iana","compressible":true},
  "application/json-seq": {"source":"iana"},
  "application/json5": {"extensions":["json5"]},
  "application/jsonml+json": {"source":"apache","compressible":true,"extensions":["jsonml"]},
  "application/jsonpath": {"source":"iana"},
  "application/jwk+json": {"source":"iana","compressible":true},
  "application/jwk-set+json": {"source":"iana","compressible":true},
  "application/jwk-set+jwt": {"source":"iana"},
  "application/jwt": {"source":"iana"},
  "application/kpml-request+xml": {"source":"iana","compressible":true},
  "application/kpml-response+xml": {"source":"iana","compressible":true},
  "application/ld+json": {"source":"iana","compressible":true,"extensions":["jsonld"]},
  "application/lgr+xml": {"source":"iana","compressible":true,"extensions":["lgr"]},
  "application/link-format": {"source":"iana"},
  "application/linkset": {"source":"iana"},
  "application/linkset+json": {"source":"iana","compressible":true},
  "application/load-control+xml": {"source":"iana","compressible":true},
  "application/logout+jwt": {"source":"iana"},
  "application/lost+xml": {"source":"iana","compressible":true,"extensions":["lostxml"]},
  "application/lostsync+xml": {"source":"iana","compressible":true},
  "application/lpf+zip": {"source":"iana","compressible":false},
  "application/lxf": {"source":"iana"},
  "application/mac-binhex40": {"source":"iana","extensions":["hqx"]},
  "application/mac-compactpro": {"source":"apache","extensions":["cpt"]},
  "application/macwriteii": {"source":"iana"},
  "application/mads+xml": {"source":"iana","compressible":true,"extensions":["mads"]},
  "application/manifest+json": {"source":"iana","charset":"UTF-8","compressible":true,"extensions":["webmanifest"]},
  "application/marc": {"source":"iana","extensions":["mrc"]},
  "application/marcxml+xml": {"source":"iana","compressible":true,"extensions":["mrcx"]},
  "application/mathematica": {"source":"iana","extensions":["ma","nb","mb"]},
  "application/mathml+xml": {"source":"iana","compressible":true,"extensions":["mathml"]},
  "application/mathml-content+xml": {"source":"iana","compressible":true},
  "application/mathml-presentation+xml": {"source":"iana","compressible":true},
  "application/mbms-associated-procedure-description+xml": {"source":"iana","compressible":true},
  "application/mbms-deregister+xml": {"source":"iana","compressible":true},
  "application/mbms-envelope+xml": {"source":"iana","compressible":true},
  "application/mbms-msk+xml": {"source":"iana","compressible":true},
  "application/mbms-msk-response+xml": {"source":"iana","compressible":true},
  "application/mbms-protection-description+xml": {"source":"iana","compressible":true},
  "application/mbms-reception-report+xml": {"source":"iana","compressible":true},
  "application/mbms-register+xml": {"source":"iana","compressible":true},
  "application/mbms-register-response+xml": {"source":"iana","compressible":true},
  "application/mbms-schedule+xml": {"source":"iana","compressible":true},
  "application/mbms-user-service-description+xml": {"source":"iana","compressible":true},
  "application/mbox": {"source":"iana","extensions":["mbox"]},
  "application/media-policy-dataset+xml": {"source":"iana","compressible":true,"extensions":["mpf"]},
  "application/media_control+xml": {"source":"iana","compressible":true},
  "application/mediaservercontrol+xml": {"source":"iana","compressible":true,"extensions":["mscml"]},
  "application/merge-patch+json": {"source":"iana","compressible":true},
  "application/metalink+xml": {"source":"apache","compressible":true,"extensions":["metalink"]},
  "application/metalink4+xml": {"source":"iana","compressible":true,"extensions":["meta4"]},
  "application/mets+xml": {"source":"iana","compressible":true,"extensions":["mets"]},
  "application/mf4": {"source":"iana"},
  "application/mikey": {"source":"iana"},
  "application/mipc": {"source":"iana"},
  "application/missing-blocks+cbor-seq": {"source":"iana"},
  "application/mmt-aei+xml": {"source":"iana","compressible":true,"extensions":["maei"]},
  "application/mmt-usd+xml": {"source":"iana","compressible":true,"extensions":["musd"]},
  "application/mods+xml": {"source":"iana","compressible":true,"extensions":["mods"]},
  "application/moss-keys": {"source":"iana"},
  "application/moss-signature": {"source":"iana"},
  "application/mosskey-data": {"source":"iana"},
  "application/mosskey-request": {"source":"iana"},
  "application/mp21": {"source":"iana","extensions":["m21","mp21"]},
  "application/mp4": {"source":"iana","extensions":["mp4","mpg4","mp4s","m4p"]},
  "application/mpeg4-generic": {"source":"iana"},
  "application/mpeg4-iod": {"source":"iana"},
  "application/mpeg4-iod-xmt": {"source":"iana"},
  "application/mrb-consumer+xml": {"source":"iana","compressible":true},
  "application/mrb-publish+xml": {"source":"iana","compressible":true},
  "application/msc-ivr+xml": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/msc-mixer+xml": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/msix": {"compressible":false,"extensions":["msix"]},
  "application/msixbundle": {"compressible":false,"extensions":["msixbundle"]},
  "application/msword": {"source":"iana","compressible":false,"extensions":["doc","dot"]},
  "application/mud+json": {"source":"iana","compressible":true},
  "application/multipart-core": {"source":"iana"},
  "application/mxf": {"source":"iana","extensions":["mxf"]},
  "application/n-quads": {"source":"iana","extensions":["nq"]},
  "application/n-triples": {"source":"iana","extensions":["nt"]},
  "application/nasdata": {"source":"iana"},
  "application/news-checkgroups": {"source":"iana","charset":"US-ASCII"},
  "application/news-groupinfo": {"source":"iana","charset":"US-ASCII"},
  "application/news-transmission": {"source":"iana"},
  "application/nlsml+xml": {"source":"iana","compressible":true},
  "application/node": {"source":"iana","extensions":["cjs"]},
  "application/nss": {"source":"iana"},
  "application/oauth-authz-req+jwt": {"source":"iana"},
  "application/oblivious-dns-message": {"source":"iana"},
  "application/ocsp-request": {"source":"iana"},
  "application/ocsp-response": {"source":"iana"},
  "application/octet-stream": {"source":"iana","compressible":true,"extensions":["bin","dms","lrf","mar","so","dist","distz","pkg","bpk","dump","elc","deploy","exe","dll","deb","dmg","iso","img","msi","msp","msm","buffer"]},
  "application/oda": {"source":"iana","extensions":["oda"]},
  "application/odm+xml": {"source":"iana","compressible":true},
  "application/odx": {"source":"iana"},
  "application/oebps-package+xml": {"source":"iana","compressible":true,"extensions":["opf"]},
  "application/ogg": {"source":"iana","compressible":false,"extensions":["ogx"]},
  "application/ohttp-keys": {"source":"iana"},
  "application/omdoc+xml": {"source":"apache","compressible":true,"extensions":["omdoc"]},
  "application/onenote": {"source":"apache","extensions":["onetoc","onetoc2","onetmp","onepkg","one","onea"]},
  "application/opc-nodeset+xml": {"source":"iana","compressible":true},
  "application/oscore": {"source":"iana"},
  "application/oxps": {"source":"iana","extensions":["oxps"]},
  "application/p21": {"source":"iana"},
  "application/p21+zip": {"source":"iana","compressible":false},
  "application/p2p-overlay+xml": {"source":"iana","compressible":true,"extensions":["relo"]},
  "application/parityfec": {"source":"iana"},
  "application/passport": {"source":"iana"},
  "application/patch-ops-error+xml": {"source":"iana","compressible":true,"extensions":["xer"]},
  "application/pdf": {"source":"iana","compressible":false,"extensions":["pdf"]},
  "application/pdx": {"source":"iana"},
  "application/pem-certificate-chain": {"source":"iana"},
  "application/pgp-encrypted": {"source":"iana","compressible":false,"extensions":["pgp"]},
  "application/pgp-keys": {"source":"iana","extensions":["asc"]},
  "application/pgp-signature": {"source":"iana","extensions":["sig","asc"]},
  "application/pics-rules": {"source":"apache","extensions":["prf"]},
  "application/pidf+xml": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/pidf-diff+xml": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/pkcs10": {"source":"iana","extensions":["p10"]},
  "application/pkcs12": {"source":"iana"},
  "application/pkcs7-mime": {"source":"iana","extensions":["p7m","p7c"]},
  "application/pkcs7-signature": {"source":"iana","extensions":["p7s"]},
  "application/pkcs8": {"source":"iana","extensions":["p8"]},
  "application/pkcs8-encrypted": {"source":"iana"},
  "application/pkix-attr-cert": {"source":"iana","extensions":["ac"]},
  "application/pkix-cert": {"source":"iana","extensions":["cer"]},
  "application/pkix-crl": {"source":"iana","extensions":["crl"]},
  "application/pkix-pkipath": {"source":"iana","extensions":["pkipath"]},
  "application/pkixcmp": {"source":"iana","extensions":["pki"]},
  "application/pls+xml": {"source":"iana","compressible":true,"extensions":["pls"]},
  "application/poc-settings+xml": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/postscript": {"source":"iana","compressible":true,"extensions":["ai","eps","ps"]},
  "application/ppsp-tracker+json": {"source":"iana","compressible":true},
  "application/private-token-issuer-directory": {"source":"iana"},
  "application/private-token-request": {"source":"iana"},
  "application/private-token-response": {"source":"iana"},
  "application/problem+json": {"source":"iana","compressible":true},
  "application/problem+xml": {"source":"iana","compressible":true},
  "application/provenance+xml": {"source":"iana","compressible":true,"extensions":["provx"]},
  "application/provided-claims+jwt": {"source":"iana"},
  "application/prs.alvestrand.titrax-sheet": {"source":"iana"},
  "application/prs.cww": {"source":"iana","extensions":["cww"]},
  "application/prs.cyn": {"source":"iana","charset":"7-BIT"},
  "application/prs.hpub+zip": {"source":"iana","compressible":false},
  "application/prs.implied-document+xml": {"source":"iana","compressible":true},
  "application/prs.implied-executable": {"source":"iana"},
  "application/prs.implied-object+json": {"source":"iana","compressible":true},
  "application/prs.implied-object+json-seq": {"source":"iana"},
  "application/prs.implied-object+yaml": {"source":"iana"},
  "application/prs.implied-structure": {"source":"iana"},
  "application/prs.mayfile": {"source":"iana"},
  "application/prs.nprend": {"source":"iana"},
  "application/prs.plucker": {"source":"iana"},
  "application/prs.rdf-xml-crypt": {"source":"iana"},
  "application/prs.vcfbzip2": {"source":"iana"},
  "application/prs.xsf+xml": {"source":"iana","compressible":true,"extensions":["xsf"]},
  "application/pskc+xml": {"source":"iana","compressible":true,"extensions":["pskcxml"]},
  "application/pvd+json": {"source":"iana","compressible":true},
  "application/qsig": {"source":"iana"},
  "application/raml+yaml": {"compressible":true,"extensions":["raml"]},
  "application/raptorfec": {"source":"iana"},
  "application/rdap+json": {"source":"iana","compressible":true},
  "application/rdf+xml": {"source":"iana","compressible":true,"extensions":["rdf","owl"]},
  "application/reginfo+xml": {"source":"iana","compressible":true,"extensions":["rif"]},
  "application/relax-ng-compact-syntax": {"source":"iana","extensions":["rnc"]},
  "application/remote-printing": {"source":"apache"},
  "application/reputon+json": {"source":"iana","compressible":true},
  "application/resolve-response+jwt": {"source":"iana"},
  "application/resource-lists+xml": {"source":"iana","compressible":true,"extensions":["rl"]},
  "application/resource-lists-diff+xml": {"source":"iana","compressible":true,"extensions":["rld"]},
  "application/rfc+xml": {"source":"iana","compressible":true},
  "application/riscos": {"source":"iana"},
  "application/rlmi+xml": {"source":"iana","compressible":true},
  "application/rls-services+xml": {"source":"iana","compressible":true,"extensions":["rs"]},
  "application/route-apd+xml": {"source":"iana","compressible":true,"extensions":["rapd"]},
  "application/route-s-tsid+xml": {"source":"iana","compressible":true,"extensions":["sls"]},
  "application/route-usd+xml": {"source":"iana","compressible":true,"extensions":["rusd"]},
  "application/rpki-checklist": {"source":"iana"},
  "application/rpki-ghostbusters": {"source":"iana","extensions":["gbr"]},
  "application/rpki-manifest": {"source":"iana","extensions":["mft"]},
  "application/rpki-publication": {"source":"iana"},
  "application/rpki-roa": {"source":"iana","extensions":["roa"]},
  "application/rpki-signed-tal": {"source":"iana"},
  "application/rpki-updown": {"source":"iana"},
  "application/rsd+xml": {"source":"apache","compressible":true,"extensions":["rsd"]},
  "application/rss+xml": {"source":"apache","compressible":true,"extensions":["rss"]},
  "application/rtf": {"source":"iana","compressible":true,"extensions":["rtf"]},
  "application/rtploopback": {"source":"iana"},
  "application/rtx": {"source":"iana"},
  "application/samlassertion+xml": {"source":"iana","compressible":true},
  "application/samlmetadata+xml": {"source":"iana","compressible":true},
  "application/sarif+json": {"source":"iana","compressible":true},
  "application/sarif-external-properties+json": {"source":"iana","compressible":true},
  "application/sbe": {"source":"iana"},
  "application/sbml+xml": {"source":"iana","compressible":true,"extensions":["sbml"]},
  "application/scaip+xml": {"source":"iana","compressible":true},
  "application/scim+json": {"source":"iana","compressible":true},
  "application/scvp-cv-request": {"source":"iana","extensions":["scq"]},
  "application/scvp-cv-response": {"source":"iana","extensions":["scs"]},
  "application/scvp-vp-request": {"source":"iana","extensions":["spq"]},
  "application/scvp-vp-response": {"source":"iana","extensions":["spp"]},
  "application/sdp": {"source":"iana","extensions":["sdp"]},
  "application/secevent+jwt": {"source":"iana"},
  "application/senml+cbor": {"source":"iana"},
  "application/senml+json": {"source":"iana","compressible":true},
  "application/senml+xml": {"source":"iana","compressible":true,"extensions":["senmlx"]},
  "application/senml-etch+cbor": {"source":"iana"},
  "application/senml-etch+json": {"source":"iana","compressible":true},
  "application/senml-exi": {"source":"iana"},
  "application/sensml+cbor": {"source":"iana"},
  "application/sensml+json": {"source":"iana","compressible":true},
  "application/sensml+xml": {"source":"iana","compressible":true,"extensions":["sensmlx"]},
  "application/sensml-exi": {"source":"iana"},
  "application/sep+xml": {"source":"iana","compressible":true},
  "application/sep-exi": {"source":"iana"},
  "application/session-info": {"source":"iana"},
  "application/set-payment": {"source":"iana"},
  "application/set-payment-initiation": {"source":"iana","extensions":["setpay"]},
  "application/set-registration": {"source":"iana"},
  "application/set-registration-initiation": {"source":"iana","extensions":["setreg"]},
  "application/sgml": {"source":"iana"},
  "application/sgml-open-catalog": {"source":"iana"},
  "application/shf+xml": {"source":"iana","compressible":true,"extensions":["shf"]},
  "application/sieve": {"source":"iana","extensions":["siv","sieve"]},
  "application/simple-filter+xml": {"source":"iana","compressible":true},
  "application/simple-message-summary": {"source":"iana"},
  "application/simplesymbolcontainer": {"source":"iana"},
  "application/sipc": {"source":"iana"},
  "application/slate": {"source":"iana"},
  "application/smil": {"source":"apache"},
  "application/smil+xml": {"source":"iana","compressible":true,"extensions":["smi","smil"]},
  "application/smpte336m": {"source":"iana"},
  "application/soap+fastinfoset": {"source":"iana"},
  "application/soap+xml": {"source":"iana","compressible":true},
  "application/sparql-query": {"source":"iana","extensions":["rq"]},
  "application/sparql-results+xml": {"source":"iana","compressible":true,"extensions":["srx"]},
  "application/spdx+json": {"source":"iana","compressible":true},
  "application/spirits-event+xml": {"source":"iana","compressible":true},
  "application/sql": {"source":"iana","extensions":["sql"]},
  "application/srgs": {"source":"iana","extensions":["gram"]},
  "application/srgs+xml": {"source":"iana","compressible":true,"extensions":["grxml"]},
  "application/sru+xml": {"source":"iana","compressible":true,"extensions":["sru"]},
  "application/ssdl+xml": {"source":"apache","compressible":true,"extensions":["ssdl"]},
  "application/sslkeylogfile": {"source":"iana"},
  "application/ssml+xml": {"source":"iana","compressible":true,"extensions":["ssml"]},
  "application/st2110-41": {"source":"iana"},
  "application/stix+json": {"source":"iana","compressible":true},
  "application/stratum": {"source":"iana"},
  "application/swid+cbor": {"source":"iana"},
  "application/swid+xml": {"source":"iana","compressible":true,"extensions":["swidtag"]},
  "application/tamp-apex-update": {"source":"iana"},
  "application/tamp-apex-update-confirm": {"source":"iana"},
  "application/tamp-community-update": {"source":"iana"},
  "application/tamp-community-update-confirm": {"source":"iana"},
  "application/tamp-error": {"source":"iana"},
  "application/tamp-sequence-adjust": {"source":"iana"},
  "application/tamp-sequence-adjust-confirm": {"source":"iana"},
  "application/tamp-status-query": {"source":"iana"},
  "application/tamp-status-response": {"source":"iana"},
  "application/tamp-update": {"source":"iana"},
  "application/tamp-update-confirm": {"source":"iana"},
  "application/tar": {"compressible":true},
  "application/taxii+json": {"source":"iana","compressible":true},
  "application/td+json": {"source":"iana","compressible":true},
  "application/tei+xml": {"source":"iana","compressible":true,"extensions":["tei","teicorpus"]},
  "application/tetra_isi": {"source":"iana"},
  "application/thraud+xml": {"source":"iana","compressible":true,"extensions":["tfi"]},
  "application/timestamp-query": {"source":"iana"},
  "application/timestamp-reply": {"source":"iana"},
  "application/timestamped-data": {"source":"iana","extensions":["tsd"]},
  "application/tlsrpt+gzip": {"source":"iana"},
  "application/tlsrpt+json": {"source":"iana","compressible":true},
  "application/tm+json": {"source":"iana","compressible":true},
  "application/tnauthlist": {"source":"iana"},
  "application/toc+cbor": {"source":"iana"},
  "application/token-introspection+jwt": {"source":"iana"},
  "application/toml": {"source":"iana","compressible":true,"extensions":["toml"]},
  "application/trickle-ice-sdpfrag": {"source":"iana"},
  "application/trig": {"source":"iana","extensions":["trig"]},
  "application/trust-chain+json": {"source":"iana","compressible":true},
  "application/trust-mark+jwt": {"source":"iana"},
  "application/trust-mark-delegation+jwt": {"source":"iana"},
  "application/ttml+xml": {"source":"iana","compressible":true,"extensions":["ttml"]},
  "application/tve-trigger": {"source":"iana"},
  "application/tzif": {"source":"iana"},
  "application/tzif-leap": {"source":"iana"},
  "application/ubjson": {"compressible":false,"extensions":["ubj"]},
  "application/uccs+cbor": {"source":"iana"},
  "application/ujcs+json": {"source":"iana","compressible":true},
  "application/ulpfec": {"source":"iana"},
  "application/urc-grpsheet+xml": {"source":"iana","compressible":true},
  "application/urc-ressheet+xml": {"source":"iana","compressible":true,"extensions":["rsheet"]},
  "application/urc-targetdesc+xml": {"source":"iana","compressible":true,"extensions":["td"]},
  "application/urc-uisocketdesc+xml": {"source":"iana","compressible":true},
  "application/vc": {"source":"iana"},
  "application/vc+cose": {"source":"iana"},
  "application/vc+jwt": {"source":"iana"},
  "application/vcard+json": {"source":"iana","compressible":true},
  "application/vcard+xml": {"source":"iana","compressible":true},
  "application/vemmi": {"source":"iana"},
  "application/vividence.scriptfile": {"source":"apache"},
  "application/vnd.1000minds.decision-model+xml": {"source":"iana","compressible":true,"extensions":["1km"]},
  "application/vnd.1ob": {"source":"iana"},
  "application/vnd.3gpp-prose+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp-prose-pc3a+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp-prose-pc3ach+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp-prose-pc3ch+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp-prose-pc8+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp-v2x-local-service-information": {"source":"iana"},
  "application/vnd.3gpp.5gnas": {"source":"iana"},
  "application/vnd.3gpp.5gsa2x": {"source":"iana"},
  "application/vnd.3gpp.5gsa2x-local-service-information": {"source":"iana"},
  "application/vnd.3gpp.5gsv2x": {"source":"iana"},
  "application/vnd.3gpp.5gsv2x-local-service-information": {"source":"iana"},
  "application/vnd.3gpp.access-transfer-events+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.bsf+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.crs+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.current-location-discovery+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.gmop+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.gtpc": {"source":"iana"},
  "application/vnd.3gpp.interworking-data": {"source":"iana"},
  "application/vnd.3gpp.lpp": {"source":"iana"},
  "application/vnd.3gpp.mc-signalling-ear": {"source":"iana"},
  "application/vnd.3gpp.mcdata-affiliation-command+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcdata-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcdata-msgstore-ctrl-request+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcdata-payload": {"source":"iana"},
  "application/vnd.3gpp.mcdata-regroup+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcdata-service-config+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcdata-signalling": {"source":"iana"},
  "application/vnd.3gpp.mcdata-ue-config+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcdata-user-profile+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcptt-affiliation-command+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcptt-floor-request+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcptt-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcptt-location-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcptt-mbms-usage-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcptt-regroup+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcptt-service-config+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcptt-signed+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcptt-ue-config+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcptt-ue-init-config+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcptt-user-profile+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcvideo-affiliation-command+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcvideo-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcvideo-location-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcvideo-mbms-usage-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcvideo-regroup+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcvideo-service-config+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcvideo-transmission-request+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcvideo-ue-config+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mcvideo-user-profile+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.mid-call+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.ngap": {"source":"iana"},
  "application/vnd.3gpp.pfcp": {"source":"iana"},
  "application/vnd.3gpp.pic-bw-large": {"source":"iana","extensions":["plb"]},
  "application/vnd.3gpp.pic-bw-small": {"source":"iana","extensions":["psb"]},
  "application/vnd.3gpp.pic-bw-var": {"source":"iana","extensions":["pvb"]},
  "application/vnd.3gpp.pinapp-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.s1ap": {"source":"iana"},
  "application/vnd.3gpp.seal-group-doc+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.seal-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.seal-location-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.seal-mbms-usage-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.seal-network-qos-management-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.seal-ue-config-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.seal-unicast-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.seal-user-profile-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.sms": {"source":"iana"},
  "application/vnd.3gpp.sms+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.srvcc-ext+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.srvcc-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.state-and-event-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.ussd+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp.v2x": {"source":"iana"},
  "application/vnd.3gpp.vae-info+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp2.bcmcsinfo+xml": {"source":"iana","compressible":true},
  "application/vnd.3gpp2.sms": {"source":"iana"},
  "application/vnd.3gpp2.tcap": {"source":"iana","extensions":["tcap"]},
  "application/vnd.3lightssoftware.imagescal": {"source":"iana"},
  "application/vnd.3m.post-it-notes": {"source":"iana","extensions":["pwn"]},
  "application/vnd.accpac.simply.aso": {"source":"iana","extensions":["aso"]},
  "application/vnd.accpac.simply.imp": {"source":"iana","extensions":["imp"]},
  "application/vnd.acm.addressxfer+json": {"source":"iana","compressible":true},
  "application/vnd.acm.chatbot+json": {"source":"iana","compressible":true},
  "application/vnd.acucobol": {"source":"iana","extensions":["acu"]},
  "application/vnd.acucorp": {"source":"iana","extensions":["atc","acutc"]},
  "application/vnd.adobe.air-application-installer-package+zip": {"source":"apache","compressible":false,"extensions":["air"]},
  "application/vnd.adobe.flash.movie": {"source":"iana"},
  "application/vnd.adobe.formscentral.fcdt": {"source":"iana","extensions":["fcdt"]},
  "application/vnd.adobe.fxp": {"source":"iana","extensions":["fxp","fxpl"]},
  "application/vnd.adobe.partial-upload": {"source":"iana"},
  "application/vnd.adobe.xdp+xml": {"source":"iana","compressible":true,"extensions":["xdp"]},
  "application/vnd.adobe.xfdf": {"source":"apache","extensions":["xfdf"]},
  "application/vnd.aether.imp": {"source":"iana"},
  "application/vnd.afpc.afplinedata": {"source":"iana"},
  "application/vnd.afpc.afplinedata-pagedef": {"source":"iana"},
  "application/vnd.afpc.cmoca-cmresource": {"source":"iana"},
  "application/vnd.afpc.foca-charset": {"source":"iana"},
  "application/vnd.afpc.foca-codedfont": {"source":"iana"},
  "application/vnd.afpc.foca-codepage": {"source":"iana"},
  "application/vnd.afpc.modca": {"source":"iana"},
  "application/vnd.afpc.modca-cmtable": {"source":"iana"},
  "application/vnd.afpc.modca-formdef": {"source":"iana"},
  "application/vnd.afpc.modca-mediummap": {"source":"iana"},
  "application/vnd.afpc.modca-objectcontainer": {"source":"iana"},
  "application/vnd.afpc.modca-overlay": {"source":"iana"},
  "application/vnd.afpc.modca-pagesegment": {"source":"iana"},
  "application/vnd.age": {"source":"iana","extensions":["age"]},
  "application/vnd.ah-barcode": {"source":"apache"},
  "application/vnd.ahead.space": {"source":"iana","extensions":["ahead"]},
  "application/vnd.airzip.filesecure.azf": {"source":"iana","extensions":["azf"]},
  "application/vnd.airzip.filesecure.azs": {"source":"iana","extensions":["azs"]},
  "application/vnd.amadeus+json": {"source":"iana","compressible":true},
  "application/vnd.amazon.ebook": {"source":"apache","extensions":["azw"]},
  "application/vnd.amazon.mobi8-ebook": {"source":"iana"},
  "application/vnd.americandynamics.acc": {"source":"iana","extensions":["acc"]},
  "application/vnd.amiga.ami": {"source":"iana","extensions":["ami"]},
  "application/vnd.amundsen.maze+xml": {"source":"iana","compressible":true},
  "application/vnd.android.ota": {"source":"iana"},
  "application/vnd.android.package-archive": {"source":"apache","compressible":false,"extensions":["apk"]},
  "application/vnd.anki": {"source":"iana"},
  "application/vnd.anser-web-certificate-issue-initiation": {"source":"iana","extensions":["cii"]},
  "application/vnd.anser-web-funds-transfer-initiation": {"source":"apache","extensions":["fti"]},
  "application/vnd.antix.game-component": {"source":"iana","extensions":["atx"]},
  "application/vnd.apache.arrow.file": {"source":"iana"},
  "application/vnd.apache.arrow.stream": {"source":"iana"},
  "application/vnd.apache.parquet": {"source":"iana"},
  "application/vnd.apache.thrift.binary": {"source":"iana"},
  "application/vnd.apache.thrift.compact": {"source":"iana"},
  "application/vnd.apache.thrift.json": {"source":"iana"},
  "application/vnd.apexlang": {"source":"iana"},
  "application/vnd.api+json": {"source":"iana","compressible":true},
  "application/vnd.aplextor.warrp+json": {"source":"iana","compressible":true},
  "application/vnd.apothekende.reservation+json": {"source":"iana","compressible":true},
  "application/vnd.apple.installer+xml": {"source":"iana","compressible":true,"extensions":["mpkg"]},
  "application/vnd.apple.keynote": {"source":"iana","extensions":["key"]},
  "application/vnd.apple.mpegurl": {"source":"iana","extensions":["m3u8"]},
  "application/vnd.apple.numbers": {"source":"iana","extensions":["numbers"]},
  "application/vnd.apple.pages": {"source":"iana","extensions":["pages"]},
  "application/vnd.apple.pkpass": {"compressible":false,"extensions":["pkpass"]},
  "application/vnd.arastra.swi": {"source":"apache"},
  "application/vnd.aristanetworks.swi": {"source":"iana","extensions":["swi"]},
  "application/vnd.artisan+json": {"source":"iana","compressible":true},
  "application/vnd.artsquare": {"source":"iana"},
  "application/vnd.astraea-software.iota": {"source":"iana","extensions":["iota"]},
  "application/vnd.audiograph": {"source":"iana","extensions":["aep"]},
  "application/vnd.autodesk.fbx": {"extensions":["fbx"]},
  "application/vnd.autopackage": {"source":"iana"},
  "application/vnd.avalon+json": {"source":"iana","compressible":true},
  "application/vnd.avistar+xml": {"source":"iana","compressible":true},
  "application/vnd.balsamiq.bmml+xml": {"source":"iana","compressible":true,"extensions":["bmml"]},
  "application/vnd.balsamiq.bmpr": {"source":"iana"},
  "application/vnd.banana-accounting": {"source":"iana"},
  "application/vnd.bbf.usp.error": {"source":"iana"},
  "application/vnd.bbf.usp.msg": {"source":"iana"},
  "application/vnd.bbf.usp.msg+json": {"source":"iana","compressible":true},
  "application/vnd.bekitzur-stech+json": {"source":"iana","compressible":true},
  "application/vnd.belightsoft.lhzd+zip": {"source":"iana","compressible":false},
  "application/vnd.belightsoft.lhzl+zip": {"source":"iana","compressible":false},
  "application/vnd.bint.med-content": {"source":"iana"},
  "application/vnd.biopax.rdf+xml": {"source":"iana","compressible":true},
  "application/vnd.blink-idb-value-wrapper": {"source":"iana"},
  "application/vnd.blueice.multipass": {"source":"iana","extensions":["mpm"]},
  "application/vnd.bluetooth.ep.oob": {"source":"iana"},
  "application/vnd.bluetooth.le.oob": {"source":"iana"},
  "application/vnd.bmi": {"source":"iana","extensions":["bmi"]},
  "application/vnd.bpf": {"source":"iana"},
  "application/vnd.bpf3": {"source":"iana"},
  "application/vnd.businessobjects": {"source":"iana","extensions":["rep"]},
  "application/vnd.byu.uapi+json": {"source":"iana","compressible":true},
  "application/vnd.bzip3": {"source":"iana"},
  "application/vnd.c3voc.schedule+xml": {"source":"iana","compressible":true},
  "application/vnd.cab-jscript": {"source":"iana"},
  "application/vnd.canon-cpdl": {"source":"iana"},
  "application/vnd.canon-lips": {"source":"iana"},
  "application/vnd.capasystems-pg+json": {"source":"iana","compressible":true},
  "application/vnd.cendio.thinlinc.clientconf": {"source":"iana"},
  "application/vnd.century-systems.tcp_stream": {"source":"iana"},
  "application/vnd.chemdraw+xml": {"source":"iana","compressible":true,"extensions":["cdxml"]},
  "application/vnd.chess-pgn": {"source":"iana"},
  "application/vnd.chipnuts.karaoke-mmd": {"source":"iana","extensions":["mmd"]},
  "application/vnd.ciedi": {"source":"iana"},
  "application/vnd.cinderella": {"source":"iana","extensions":["cdy"]},
  "application/vnd.cirpack.isdn-ext": {"source":"iana"},
  "application/vnd.citationstyles.style+xml": {"source":"iana","compressible":true,"extensions":["csl"]},
  "application/vnd.claymore": {"source":"iana","extensions":["cla"]},
  "application/vnd.cloanto.rp9": {"source":"iana","extensions":["rp9"]},
  "application/vnd.clonk.c4group": {"source":"iana","extensions":["c4g","c4d","c4f","c4p","c4u"]},
  "application/vnd.cluetrust.cartomobile-config": {"source":"iana","extensions":["c11amc"]},
  "application/vnd.cluetrust.cartomobile-config-pkg": {"source":"iana","extensions":["c11amz"]},
  "application/vnd.cncf.helm.chart.content.v1.tar+gzip": {"source":"iana"},
  "application/vnd.cncf.helm.chart.provenance.v1.prov": {"source":"iana"},
  "application/vnd.cncf.helm.config.v1+json": {"source":"iana","compressible":true},
  "application/vnd.coffeescript": {"source":"iana"},
  "application/vnd.collabio.xodocuments.document": {"source":"iana"},
  "application/vnd.collabio.xodocuments.document-template": {"source":"iana"},
  "application/vnd.collabio.xodocuments.presentation": {"source":"iana"},
  "application/vnd.collabio.xodocuments.presentation-template": {"source":"iana"},
  "application/vnd.collabio.xodocuments.spreadsheet": {"source":"iana"},
  "application/vnd.collabio.xodocuments.spreadsheet-template": {"source":"iana"},
  "application/vnd.collection+json": {"source":"iana","compressible":true},
  "application/vnd.collection.doc+json": {"source":"iana","compressible":true},
  "application/vnd.collection.next+json": {"source":"iana","compressible":true},
  "application/vnd.comicbook+zip": {"source":"iana","compressible":false},
  "application/vnd.comicbook-rar": {"source":"iana"},
  "application/vnd.commerce-battelle": {"source":"iana"},
  "application/vnd.commonspace": {"source":"iana","extensions":["csp"]},
  "application/vnd.contact.cmsg": {"source":"iana","extensions":["cdbcmsg"]},
  "application/vnd.coreos.ignition+json": {"source":"iana","compressible":true},
  "application/vnd.cosmocaller": {"source":"iana","extensions":["cmc"]},
  "application/vnd.crick.clicker": {"source":"iana","extensions":["clkx"]},
  "application/vnd.crick.clicker.keyboard": {"source":"iana","extensions":["clkk"]},
  "application/vnd.crick.clicker.palette": {"source":"iana","extensions":["clkp"]},
  "application/vnd.crick.clicker.template": {"source":"iana","extensions":["clkt"]},
  "application/vnd.crick.clicker.wordbank": {"source":"iana","extensions":["clkw"]},
  "application/vnd.criticaltools.wbs+xml": {"source":"iana","compressible":true,"extensions":["wbs"]},
  "application/vnd.cryptii.pipe+json": {"source":"iana","compressible":true},
  "application/vnd.crypto-shade-file": {"source":"iana"},
  "application/vnd.cryptomator.encrypted": {"source":"iana"},
  "application/vnd.cryptomator.vault": {"source":"iana"},
  "application/vnd.ctc-posml": {"source":"iana","extensions":["pml"]},
  "application/vnd.ctct.ws+xml": {"source":"iana","compressible":true},
  "application/vnd.cups-pdf": {"source":"iana"},
  "application/vnd.cups-postscript": {"source":"iana"},
  "application/vnd.cups-ppd": {"source":"iana","extensions":["ppd"]},
  "application/vnd.cups-raster": {"source":"iana"},
  "application/vnd.cups-raw": {"source":"iana"},
  "application/vnd.curl": {"source":"iana"},
  "application/vnd.curl.car": {"source":"apache","extensions":["car"]},
  "application/vnd.curl.pcurl": {"source":"apache","extensions":["pcurl"]},
  "application/vnd.cyan.dean.root+xml": {"source":"iana","compressible":true},
  "application/vnd.cybank": {"source":"iana"},
  "application/vnd.cyclonedx+json": {"source":"iana","compressible":true},
  "application/vnd.cyclonedx+xml": {"source":"iana","compressible":true},
  "application/vnd.d2l.coursepackage1p0+zip": {"source":"iana","compressible":false},
  "application/vnd.d3m-dataset": {"source":"iana"},
  "application/vnd.d3m-problem": {"source":"iana"},
  "application/vnd.dart": {"source":"iana","compressible":true,"extensions":["dart"]},
  "application/vnd.data-vision.rdz": {"source":"iana","extensions":["rdz"]},
  "application/vnd.datalog": {"source":"iana"},
  "application/vnd.datapackage+json": {"source":"iana","compressible":true},
  "application/vnd.dataresource+json": {"source":"iana","compressible":true},
  "application/vnd.dbf": {"source":"iana","extensions":["dbf"]},
  "application/vnd.dcmp+xml": {"source":"iana","compressible":true,"extensions":["dcmp"]},
  "application/vnd.debian.binary-package": {"source":"iana"},
  "application/vnd.dece.data": {"source":"iana","extensions":["uvf","uvvf","uvd","uvvd"]},
  "application/vnd.dece.ttml+xml": {"source":"iana","compressible":true,"extensions":["uvt","uvvt"]},
  "application/vnd.dece.unspecified": {"source":"iana","extensions":["uvx","uvvx"]},
  "application/vnd.dece.zip": {"source":"iana","extensions":["uvz","uvvz"]},
  "application/vnd.denovo.fcselayout-link": {"source":"iana","extensions":["fe_launch"]},
  "application/vnd.desmume.movie": {"source":"iana"},
  "application/vnd.dir-bi.plate-dl-nosuffix": {"source":"iana"},
  "application/vnd.dm.delegation+xml": {"source":"iana","compressible":true},
  "application/vnd.dna": {"source":"iana","extensions":["dna"]},
  "application/vnd.document+json": {"source":"iana","compressible":true},
  "application/vnd.dolby.mlp": {"source":"apache","extensions":["mlp"]},
  "application/vnd.dolby.mobile.1": {"source":"iana"},
  "application/vnd.dolby.mobile.2": {"source":"iana"},
  "application/vnd.doremir.scorecloud-binary-document": {"source":"iana"},
  "application/vnd.dpgraph": {"source":"iana","extensions":["dpg"]},
  "application/vnd.dreamfactory": {"source":"iana","extensions":["dfac"]},
  "application/vnd.drive+json": {"source":"iana","compressible":true},
  "application/vnd.ds-keypoint": {"source":"apache","extensions":["kpxx"]},
  "application/vnd.dtg.local": {"source":"iana"},
  "application/vnd.dtg.local.flash": {"source":"iana"},
  "application/vnd.dtg.local.html": {"source":"iana"},
  "application/vnd.dvb.ait": {"source":"iana","extensions":["ait"]},
  "application/vnd.dvb.dvbisl+xml": {"source":"iana","compressible":true},
  "application/vnd.dvb.dvbj": {"source":"iana"},
  "application/vnd.dvb.esgcontainer": {"source":"iana"},
  "application/vnd.dvb.ipdcdftnotifaccess": {"source":"iana"},
  "application/vnd.dvb.ipdcesgaccess": {"source":"iana"},
  "application/vnd.dvb.ipdcesgaccess2": {"source":"iana"},
  "application/vnd.dvb.ipdcesgpdd": {"source":"iana"},
  "application/vnd.dvb.ipdcroaming": {"source":"iana"},
  "application/vnd.dvb.iptv.alfec-base": {"source":"iana"},
  "application/vnd.dvb.iptv.alfec-enhancement": {"source":"iana"},
  "application/vnd.dvb.notif-aggregate-root+xml": {"source":"iana","compressible":true},
  "application/vnd.dvb.notif-container+xml": {"source":"iana","compressible":true},
  "application/vnd.dvb.notif-generic+xml": {"source":"iana","compressible":true},
  "application/vnd.dvb.notif-ia-msglist+xml": {"source":"iana","compressible":true},
  "application/vnd.dvb.notif-ia-registration-request+xml": {"source":"iana","compressible":true},
  "application/vnd.dvb.notif-ia-registration-response+xml": {"source":"iana","compressible":true},
  "application/vnd.dvb.notif-init+xml": {"source":"iana","compressible":true},
  "application/vnd.dvb.pfr": {"source":"iana"},
  "application/vnd.dvb.service": {"source":"iana","extensions":["svc"]},
  "application/vnd.dxr": {"source":"iana"},
  "application/vnd.dynageo": {"source":"iana","extensions":["geo"]},
  "application/vnd.dzr": {"source":"iana"},
  "application/vnd.easykaraoke.cdgdownload": {"source":"iana"},
  "application/vnd.ecdis-update": {"source":"iana"},
  "application/vnd.ecip.rlp": {"source":"iana"},
  "application/vnd.eclipse.ditto+json": {"source":"iana","compressible":true},
  "application/vnd.ecowin.chart": {"source":"iana","extensions":["mag"]},
  "application/vnd.ecowin.filerequest": {"source":"iana"},
  "application/vnd.ecowin.fileupdate": {"source":"iana"},
  "application/vnd.ecowin.series": {"source":"iana"},
  "application/vnd.ecowin.seriesrequest": {"source":"iana"},
  "application/vnd.ecowin.seriesupdate": {"source":"iana"},
  "application/vnd.efi.img": {"source":"iana"},
  "application/vnd.efi.iso": {"source":"iana"},
  "application/vnd.eln+zip": {"source":"iana","compressible":false},
  "application/vnd.emclient.accessrequest+xml": {"source":"iana","compressible":true},
  "application/vnd.enliven": {"source":"iana","extensions":["nml"]},
  "application/vnd.enphase.envoy": {"source":"iana"},
  "application/vnd.eprints.data+xml": {"source":"iana","compressible":true},
  "application/vnd.epson.esf": {"source":"iana","extensions":["esf"]},
  "application/vnd.epson.msf": {"source":"iana","extensions":["msf"]},
  "application/vnd.epson.quickanime": {"source":"iana","extensions":["qam"]},
  "application/vnd.epson.salt": {"source":"iana","extensions":["slt"]},
  "application/vnd.epson.ssf": {"source":"iana","extensions":["ssf"]},
  "application/vnd.ericsson.quickcall": {"source":"iana"},
  "application/vnd.erofs": {"source":"iana"},
  "application/vnd.espass-espass+zip": {"source":"iana","compressible":false},
  "application/vnd.eszigno3+xml": {"source":"iana","compressible":true,"extensions":["es3","et3"]},
  "application/vnd.etsi.aoc+xml": {"source":"iana","compressible":true},
  "application/vnd.etsi.asic-e+zip": {"source":"iana","compressible":false},
  "application/vnd.etsi.asic-s+zip": {"source":"iana","compressible":false},
  "application/vnd.etsi.cug+xml": {"source":"iana","compressible":true},
  "application/vnd.etsi.iptvcommand+xml": {"source":"iana","compressible":true},
  "application/vnd.etsi.iptvdiscovery+xml": {"source":"iana","compressible":true},
  "application/vnd.etsi.iptvprofile+xml": {"source":"iana","compressible":true},
  "application/vnd.etsi.iptvsad-bc+xml": {"source":"iana","compressible":true},
  "application/vnd.etsi.iptvsad-cod+xml": {"source":"iana","compressible":true},
  "application/vnd.etsi.iptvsad-npvr+xml": {"source":"iana","compressible":true},
  "application/vnd.etsi.iptvservice+xml": {"source":"iana","compressible":true},
  "application/vnd.etsi.iptvsync+xml": {"source":"iana","compressible":true},
  "application/vnd.etsi.iptvueprofile+xml": {"source":"iana","compressible":true},
  "application/vnd.etsi.mcid+xml": {"source":"iana","compressible":true},
  "application/vnd.etsi.mheg5": {"source":"iana"},
  "application/vnd.etsi.overload-control-policy-dataset+xml": {"source":"iana","compressible":true},
  "application/vnd.etsi.pstn+xml": {"source":"iana","compressible":true},
  "application/vnd.etsi.sci+xml": {"source":"iana","compressible":true},
  "application/vnd.etsi.simservs+xml": {"source":"iana","compressible":true},
  "application/vnd.etsi.timestamp-token": {"source":"iana"},
  "application/vnd.etsi.tsl+xml": {"source":"iana","compressible":true},
  "application/vnd.etsi.tsl.der": {"source":"iana"},
  "application/vnd.eu.kasparian.car+json": {"source":"iana","compressible":true},
  "application/vnd.eudora.data": {"source":"iana"},
  "application/vnd.evolv.ecig.profile": {"source":"iana"},
  "application/vnd.evolv.ecig.settings": {"source":"iana"},
  "application/vnd.evolv.ecig.theme": {"source":"iana"},
  "application/vnd.exstream-empower+zip": {"source":"iana","compressible":false},
  "application/vnd.exstream-package": {"source":"iana"},
  "application/vnd.ezpix-album": {"source":"iana","extensions":["ez2"]},
  "application/vnd.ezpix-package": {"source":"iana","extensions":["ez3"]},
  "application/vnd.f-secure.mobile": {"source":"iana"},
  "application/vnd.familysearch.gedcom+zip": {"source":"iana","compressible":false},
  "application/vnd.fastcopy-disk-image": {"source":"iana"},
  "application/vnd.fdf": {"source":"apache","extensions":["fdf"]},
  "application/vnd.fdsn.mseed": {"source":"iana","extensions":["mseed"]},
  "application/vnd.fdsn.seed": {"source":"iana","extensions":["seed","dataless"]},
  "application/vnd.fdsn.stationxml+xml": {"source":"iana","charset":"XML-BASED","compressible":true},
  "application/vnd.ffsns": {"source":"iana"},
  "application/vnd.ficlab.flb+zip": {"source":"iana","compressible":false},
  "application/vnd.filmit.zfc": {"source":"iana"},
  "application/vnd.fints": {"source":"iana"},
  "application/vnd.firemonkeys.cloudcell": {"source":"iana"},
  "application/vnd.flographit": {"source":"iana","extensions":["gph"]},
  "application/vnd.fluxtime.clip": {"source":"iana","extensions":["ftc"]},
  "application/vnd.font-fontforge-sfd": {"source":"iana"},
  "application/vnd.framemaker": {"source":"iana","extensions":["fm","frame","maker","book"]},
  "application/vnd.freelog.comic": {"source":"iana"},
  "application/vnd.frogans.fnc": {"source":"apache","extensions":["fnc"]},
  "application/vnd.frogans.ltf": {"source":"apache","extensions":["ltf"]},
  "application/vnd.fsc.weblaunch": {"source":"iana","extensions":["fsc"]},
  "application/vnd.fujifilm.fb.docuworks": {"source":"iana"},
  "application/vnd.fujifilm.fb.docuworks.binder": {"source":"iana"},
  "application/vnd.fujifilm.fb.docuworks.container": {"source":"iana"},
  "application/vnd.fujifilm.fb.jfi+xml": {"source":"iana","compressible":true},
  "application/vnd.fujitsu.oasys": {"source":"iana","extensions":["oas"]},
  "application/vnd.fujitsu.oasys2": {"source":"iana","extensions":["oa2"]},
  "application/vnd.fujitsu.oasys3": {"source":"iana","extensions":["oa3"]},
  "application/vnd.fujitsu.oasysgp": {"source":"iana","extensions":["fg5"]},
  "application/vnd.fujitsu.oasysprs": {"source":"iana","extensions":["bh2"]},
  "application/vnd.fujixerox.art-ex": {"source":"iana"},
  "application/vnd.fujixerox.art4": {"source":"iana"},
  "application/vnd.fujixerox.ddd": {"source":"iana","extensions":["ddd"]},
  "application/vnd.fujixerox.docuworks": {"source":"iana","extensions":["xdw"]},
  "application/vnd.fujixerox.docuworks.binder": {"source":"iana","extensions":["xbd"]},
  "application/vnd.fujixerox.docuworks.container": {"source":"iana"},
  "application/vnd.fujixerox.hbpl": {"source":"iana"},
  "application/vnd.fut-misnet": {"source":"iana"},
  "application/vnd.futoin+cbor": {"source":"iana"},
  "application/vnd.futoin+json": {"source":"iana","compressible":true},
  "application/vnd.fuzzysheet": {"source":"iana","extensions":["fzs"]},
  "application/vnd.ga4gh.passport+jwt": {"source":"iana"},
  "application/vnd.genomatix.tuxedo": {"source":"iana","extensions":["txd"]},
  "application/vnd.genozip": {"source":"iana"},
  "application/vnd.gentics.grd+json": {"source":"iana","compressible":true},
  "application/vnd.gentoo.catmetadata+xml": {"source":"iana","compressible":true},
  "application/vnd.gentoo.ebuild": {"source":"iana"},
  "application/vnd.gentoo.eclass": {"source":"iana"},
  "application/vnd.gentoo.gpkg": {"source":"iana"},
  "application/vnd.gentoo.manifest": {"source":"iana"},
  "application/vnd.gentoo.pkgmetadata+xml": {"source":"iana","compressible":true},
  "application/vnd.gentoo.xpak": {"source":"iana"},
  "application/vnd.geo+json": {"source":"apache","compressible":true},
  "application/vnd.geocube+xml": {"source":"apache","compressible":true},
  "application/vnd.geogebra.file": {"source":"iana","extensions":["ggb"]},
  "application/vnd.geogebra.pinboard": {"source":"iana"},
  "application/vnd.geogebra.slides": {"source":"iana","extensions":["ggs"]},
  "application/vnd.geogebra.tool": {"source":"iana","extensions":["ggt"]},
  "application/vnd.geometry-explorer": {"source":"iana","extensions":["gex","gre"]},
  "application/vnd.geonext": {"source":"iana","extensions":["gxt"]},
  "application/vnd.geoplan": {"source":"iana","extensions":["g2w"]},
  "application/vnd.geospace": {"source":"iana","extensions":["g3w"]},
  "application/vnd.gerber": {"source":"iana"},
  "application/vnd.globalplatform.card-content-mgt": {"source":"iana"},
  "application/vnd.globalplatform.card-content-mgt-response": {"source":"iana"},
  "application/vnd.gmx": {"source":"iana","extensions":["gmx"]},
  "application/vnd.gnu.taler.exchange+json": {"source":"iana","compressible":true},
  "application/vnd.gnu.taler.merchant+json": {"source":"iana","compressible":true},
  "application/vnd.google-apps.audio": {},
  "application/vnd.google-apps.document": {"compressible":false,"extensions":["gdoc"]},
  "application/vnd.google-apps.drawing": {"compressible":false,"extensions":["gdraw"]},
  "application/vnd.google-apps.drive-sdk": {"compressible":false},
  "application/vnd.google-apps.file": {},
  "application/vnd.google-apps.folder": {"compressible":false},
  "application/vnd.google-apps.form": {"compressible":false,"extensions":["gform"]},
  "application/vnd.google-apps.fusiontable": {},
  "application/vnd.google-apps.jam": {"compressible":false,"extensions":["gjam"]},
  "application/vnd.google-apps.mail-layout": {},
  "application/vnd.google-apps.map": {"compressible":false,"extensions":["gmap"]},
  "application/vnd.google-apps.photo": {},
  "application/vnd.google-apps.presentation": {"compressible":false,"extensions":["gslides"]},
  "application/vnd.google-apps.script": {"compressible":false,"extensions":["gscript"]},
  "application/vnd.google-apps.shortcut": {},
  "application/vnd.google-apps.site": {"compressible":false,"extensions":["gsite"]},
  "application/vnd.google-apps.spreadsheet": {"compressible":false,"extensions":["gsheet"]},
  "application/vnd.google-apps.unknown": {},
  "application/vnd.google-apps.video": {},
  "application/vnd.google-earth.kml+xml": {"source":"iana","compressible":true,"extensions":["kml"]},
  "application/vnd.google-earth.kmz": {"source":"iana","compressible":false,"extensions":["kmz"]},
  "application/vnd.gov.sk.e-form+xml": {"source":"apache","compressible":true},
  "application/vnd.gov.sk.e-form+zip": {"source":"iana","compressible":false},
  "application/vnd.gov.sk.xmldatacontainer+xml": {"source":"iana","compressible":true,"extensions":["xdcf"]},
  "application/vnd.gpxsee.map+xml": {"source":"iana","compressible":true},
  "application/vnd.grafeq": {"source":"iana","extensions":["gqf","gqs"]},
  "application/vnd.gridmp": {"source":"iana"},
  "application/vnd.groove-account": {"source":"iana","extensions":["gac"]},
  "application/vnd.groove-help": {"source":"iana","extensions":["ghf"]},
  "application/vnd.groove-identity-message": {"source":"iana","extensions":["gim"]},
  "application/vnd.groove-injector": {"source":"iana","extensions":["grv"]},
  "application/vnd.groove-tool-message": {"source":"iana","extensions":["gtm"]},
  "application/vnd.groove-tool-template": {"source":"iana","extensions":["tpl"]},
  "application/vnd.groove-vcard": {"source":"iana","extensions":["vcg"]},
  "application/vnd.hal+json": {"source":"iana","compressible":true},
  "application/vnd.hal+xml": {"source":"iana","compressible":true,"extensions":["hal"]},
  "application/vnd.handheld-entertainment+xml": {"source":"iana","compressible":true,"extensions":["zmm"]},
  "application/vnd.hbci": {"source":"iana","extensions":["hbci"]},
  "application/vnd.hc+json": {"source":"iana","compressible":true},
  "application/vnd.hcl-bireports": {"source":"iana"},
  "application/vnd.hdt": {"source":"iana"},
  "application/vnd.heroku+json": {"source":"iana","compressible":true},
  "application/vnd.hhe.lesson-player": {"source":"iana","extensions":["les"]},
  "application/vnd.hp-hpgl": {"source":"iana","extensions":["hpgl"]},
  "application/vnd.hp-hpid": {"source":"iana","extensions":["hpid"]},
  "application/vnd.hp-hps": {"source":"iana","extensions":["hps"]},
  "application/vnd.hp-jlyt": {"source":"iana","extensions":["jlt"]},
  "application/vnd.hp-pcl": {"source":"iana","extensions":["pcl"]},
  "application/vnd.hp-pclxl": {"source":"iana","extensions":["pclxl"]},
  "application/vnd.hsl": {"source":"iana"},
  "application/vnd.httphone": {"source":"iana"},
  "application/vnd.hydrostatix.sof-data": {"source":"iana","extensions":["sfd-hdstx"]},
  "application/vnd.hyper+json": {"source":"iana","compressible":true},
  "application/vnd.hyper-item+json": {"source":"iana","compressible":true},
  "application/vnd.hyperdrive+json": {"source":"iana","compressible":true},
  "application/vnd.hzn-3d-crossword": {"source":"iana"},
  "application/vnd.ibm.afplinedata": {"source":"apache"},
  "application/vnd.ibm.electronic-media": {"source":"iana"},
  "application/vnd.ibm.minipay": {"source":"iana","extensions":["mpy"]},
  "application/vnd.ibm.modcap": {"source":"apache","extensions":["afp","listafp","list3820"]},
  "application/vnd.ibm.rights-management": {"source":"iana","extensions":["irm"]},
  "application/vnd.ibm.secure-container": {"source":"iana","extensions":["sc"]},
  "application/vnd.iccprofile": {"source":"iana","extensions":["icc","icm"]},
  "application/vnd.ieee.1905": {"source":"iana"},
  "application/vnd.igloader": {"source":"iana","extensions":["igl"]},
  "application/vnd.imagemeter.folder+zip": {"source":"iana","compressible":false},
  "application/vnd.imagemeter.image+zip": {"source":"iana","compressible":false},
  "application/vnd.immervision-ivp": {"source":"iana","extensions":["ivp"]},
  "application/vnd.immervision-ivu": {"source":"iana","extensions":["ivu"]},
  "application/vnd.ims.imsccv1p1": {"source":"iana"},
  "application/vnd.ims.imsccv1p2": {"source":"iana"},
  "application/vnd.ims.imsccv1p3": {"source":"iana"},
  "application/vnd.ims.lis.v2.result+json": {"source":"iana","compressible":true},
  "application/vnd.ims.lti.v2.toolconsumerprofile+json": {"source":"iana","compressible":true},
  "application/vnd.ims.lti.v2.toolproxy+json": {"source":"iana","compressible":true},
  "application/vnd.ims.lti.v2.toolproxy.id+json": {"source":"iana","compressible":true},
  "application/vnd.ims.lti.v2.toolsettings+json": {"source":"iana","compressible":true},
  "application/vnd.ims.lti.v2.toolsettings.simple+json": {"source":"iana","compressible":true},
  "application/vnd.informedcontrol.rms+xml": {"source":"iana","compressible":true},
  "application/vnd.informix-visionary": {"source":"apache"},
  "application/vnd.infotech.project": {"source":"iana"},
  "application/vnd.infotech.project+xml": {"source":"iana","compressible":true},
  "application/vnd.innopath.wamp.notification": {"source":"iana"},
  "application/vnd.insors.igm": {"source":"iana","extensions":["igm"]},
  "application/vnd.intercon.formnet": {"source":"iana","extensions":["xpw","xpx"]},
  "application/vnd.intergeo": {"source":"iana","extensions":["i2g"]},
  "application/vnd.intertrust.digibox": {"source":"iana"},
  "application/vnd.intertrust.nncp": {"source":"iana"},
  "application/vnd.intu.qbo": {"source":"iana","extensions":["qbo"]},
  "application/vnd.intu.qfx": {"source":"iana","extensions":["qfx"]},
  "application/vnd.ipfs.ipns-record": {"source":"iana"},
  "application/vnd.ipld.car": {"source":"iana"},
  "application/vnd.ipld.dag-cbor": {"source":"iana"},
  "application/vnd.ipld.dag-json": {"source":"iana"},
  "application/vnd.ipld.raw": {"source":"iana"},
  "application/vnd.iptc.g2.catalogitem+xml": {"source":"iana","compressible":true},
  "application/vnd.iptc.g2.conceptitem+xml": {"source":"iana","compressible":true},
  "application/vnd.iptc.g2.knowledgeitem+xml": {"source":"iana","compressible":true},
  "application/vnd.iptc.g2.newsitem+xml": {"source":"iana","compressible":true},
  "application/vnd.iptc.g2.newsmessage+xml": {"source":"iana","compressible":true},
  "application/vnd.iptc.g2.packageitem+xml": {"source":"iana","compressible":true},
  "application/vnd.iptc.g2.planningitem+xml": {"source":"iana","compressible":true},
  "application/vnd.ipunplugged.rcprofile": {"source":"iana","extensions":["rcprofile"]},
  "application/vnd.irepository.package+xml": {"source":"iana","compressible":true,"extensions":["irp"]},
  "application/vnd.is-xpr": {"source":"iana","extensions":["xpr"]},
  "application/vnd.isac.fcs": {"source":"iana","extensions":["fcs"]},
  "application/vnd.iso11783-10+zip": {"source":"iana","compressible":false},
  "application/vnd.jam": {"source":"iana","extensions":["jam"]},
  "application/vnd.japannet-directory-service": {"source":"iana"},
  "application/vnd.japannet-jpnstore-wakeup": {"source":"iana"},
  "application/vnd.japannet-payment-wakeup": {"source":"iana"},
  "application/vnd.japannet-registration": {"source":"iana"},
  "application/vnd.japannet-registration-wakeup": {"source":"iana"},
  "application/vnd.japannet-setstore-wakeup": {"source":"iana"},
  "application/vnd.japannet-verification": {"source":"iana"},
  "application/vnd.japannet-verification-wakeup": {"source":"iana"},
  "application/vnd.jcp.javame.midlet-rms": {"source":"iana","extensions":["rms"]},
  "application/vnd.jisp": {"source":"iana","extensions":["jisp"]},
  "application/vnd.joost.joda-archive": {"source":"iana","extensions":["joda"]},
  "application/vnd.jsk.isdn-ngn": {"source":"iana"},
  "application/vnd.kahootz": {"source":"iana","extensions":["ktz","ktr"]},
  "application/vnd.kde.karbon": {"source":"iana","extensions":["karbon"]},
  "application/vnd.kde.kchart": {"source":"iana","extensions":["chrt"]},
  "application/vnd.kde.kformula": {"source":"iana","extensions":["kfo"]},
  "application/vnd.kde.kivio": {"source":"iana","extensions":["flw"]},
  "application/vnd.kde.kontour": {"source":"iana","extensions":["kon"]},
  "application/vnd.kde.kpresenter": {"source":"iana","extensions":["kpr","kpt"]},
  "application/vnd.kde.kspread": {"source":"iana","extensions":["ksp"]},
  "application/vnd.kde.kword": {"source":"iana","extensions":["kwd","kwt"]},
  "application/vnd.kdl": {"source":"iana"},
  "application/vnd.kenameaapp": {"source":"iana","extensions":["htke"]},
  "application/vnd.keyman.kmp+zip": {"source":"iana","compressible":false},
  "application/vnd.keyman.kmx": {"source":"iana"},
  "application/vnd.kidspiration": {"source":"iana","extensions":["kia"]},
  "application/vnd.kinar": {"source":"iana","extensions":["kne","knp"]},
  "application/vnd.koan": {"source":"iana","extensions":["skp","skd","skt","skm"]},
  "application/vnd.kodak-descriptor": {"source":"iana","extensions":["sse"]},
  "application/vnd.las": {"source":"iana"},
  "application/vnd.las.las+json": {"source":"iana","compressible":true},
  "application/vnd.las.las+xml": {"source":"iana","compressible":true,"extensions":["lasxml"]},
  "application/vnd.laszip": {"source":"iana"},
  "application/vnd.ldev.productlicensing": {"source":"iana"},
  "application/vnd.leap+json": {"source":"iana","compressible":true},
  "application/vnd.liberty-request+xml": {"source":"iana","compressible":true},
  "application/vnd.llamagraphics.life-balance.desktop": {"source":"iana","extensions":["lbd"]},
  "application/vnd.llamagraphics.life-balance.exchange+xml": {"source":"iana","compressible":true,"extensions":["lbe"]},
  "application/vnd.logipipe.circuit+zip": {"source":"iana","compressible":false},
  "application/vnd.loom": {"source":"iana"},
  "application/vnd.lotus-1-2-3": {"source":"iana","extensions":["123"]},
  "application/vnd.lotus-approach": {"source":"iana","extensions":["apr"]},
  "application/vnd.lotus-freelance": {"source":"iana","extensions":["pre"]},
  "application/vnd.lotus-notes": {"source":"iana","extensions":["nsf"]},
  "application/vnd.lotus-organizer": {"source":"iana","extensions":["org"]},
  "application/vnd.lotus-screencam": {"source":"iana","extensions":["scm"]},
  "application/vnd.lotus-wordpro": {"source":"iana","extensions":["lwp"]},
  "application/vnd.macports.portpkg": {"source":"iana","extensions":["portpkg"]},
  "application/vnd.mapbox-vector-tile": {"source":"iana","extensions":["mvt"]},
  "application/vnd.marlin.drm.actiontoken+xml": {"source":"iana","compressible":true},
  "application/vnd.marlin.drm.conftoken+xml": {"source":"iana","compressible":true},
  "application/vnd.marlin.drm.license+xml": {"source":"iana","compressible":true},
  "application/vnd.marlin.drm.mdcf": {"source":"iana"},
  "application/vnd.mason+json": {"source":"iana","compressible":true},
  "application/vnd.maxar.archive.3tz+zip": {"source":"iana","compressible":false},
  "application/vnd.maxmind.maxmind-db": {"source":"iana"},
  "application/vnd.mcd": {"source":"iana","extensions":["mcd"]},
  "application/vnd.mdl": {"source":"iana"},
  "application/vnd.mdl-mbsdf": {"source":"iana"},
  "application/vnd.medcalcdata": {"source":"iana","extensions":["mc1"]},
  "application/vnd.mediastation.cdkey": {"source":"iana","extensions":["cdkey"]},
  "application/vnd.medicalholodeck.recordxr": {"source":"iana"},
  "application/vnd.meridian-slingshot": {"source":"iana"},
  "application/vnd.mermaid": {"source":"iana"},
  "application/vnd.mfer": {"source":"iana","extensions":["mwf"]},
  "application/vnd.mfmp": {"source":"iana","extensions":["mfm"]},
  "application/vnd.micro+json": {"source":"iana","compressible":true},
  "application/vnd.micrografx.flo": {"source":"iana","extensions":["flo"]},
  "application/vnd.micrografx.igx": {"source":"iana","extensions":["igx"]},
  "application/vnd.microsoft.portable-executable": {"source":"iana"},
  "application/vnd.microsoft.windows.thumbnail-cache": {"source":"iana"},
  "application/vnd.miele+json": {"source":"iana","compressible":true},
  "application/vnd.mif": {"source":"iana","extensions":["mif"]},
  "application/vnd.minisoft-hp3000-save": {"source":"iana"},
  "application/vnd.mitsubishi.misty-guard.trustweb": {"source":"iana"},
  "application/vnd.mobius.daf": {"source":"iana","extensions":["daf"]},
  "application/vnd.mobius.dis": {"source":"iana","extensions":["dis"]},
  "application/vnd.mobius.mbk": {"source":"iana","extensions":["mbk"]},
  "application/vnd.mobius.mqy": {"source":"iana","extensions":["mqy"]},
  "application/vnd.mobius.msl": {"source":"iana","extensions":["msl"]},
  "application/vnd.mobius.plc": {"source":"iana","extensions":["plc"]},
  "application/vnd.mobius.txf": {"source":"iana","extensions":["txf"]},
  "application/vnd.modl": {"source":"iana"},
  "application/vnd.mophun.application": {"source":"iana","extensions":["mpn"]},
  "application/vnd.mophun.certificate": {"source":"iana","extensions":["mpc"]},
  "application/vnd.motorola.flexsuite": {"source":"iana"},
  "application/vnd.motorola.flexsuite.adsi": {"source":"iana"},
  "application/vnd.motorola.flexsuite.fis": {"source":"iana"},
  "application/vnd.motorola.flexsuite.gotap": {"source":"iana"},
  "application/vnd.motorola.flexsuite.kmr": {"source":"iana"},
  "application/vnd.motorola.flexsuite.ttc": {"source":"iana"},
  "application/vnd.motorola.flexsuite.wem": {"source":"iana"},
  "application/vnd.motorola.iprm": {"source":"iana"},
  "application/vnd.mozilla.xul+xml": {"source":"iana","compressible":true,"extensions":["xul"]},
  "application/vnd.ms-3mfdocument": {"source":"iana"},
  "application/vnd.ms-artgalry": {"source":"iana","extensions":["cil"]},
  "application/vnd.ms-asf": {"source":"iana"},
  "application/vnd.ms-cab-compressed": {"source":"iana","extensions":["cab"]},
  "application/vnd.ms-color.iccprofile": {"source":"apache"},
  "application/vnd.ms-excel": {"source":"iana","compressible":false,"extensions":["xls","xlm","xla","xlc","xlt","xlw"]},
  "application/vnd.ms-excel.addin.macroenabled.12": {"source":"iana","extensions":["xlam"]},
  "application/vnd.ms-excel.sheet.binary.macroenabled.12": {"source":"iana","extensions":["xlsb"]},
  "application/vnd.ms-excel.sheet.macroenabled.12": {"source":"iana","extensions":["xlsm"]},
  "application/vnd.ms-excel.template.macroenabled.12": {"source":"iana","extensions":["xltm"]},
  "application/vnd.ms-fontobject": {"source":"iana","compressible":true,"extensions":["eot"]},
  "application/vnd.ms-htmlhelp": {"source":"iana","extensions":["chm"]},
  "application/vnd.ms-ims": {"source":"iana","extensions":["ims"]},
  "application/vnd.ms-lrm": {"source":"iana","extensions":["lrm"]},
  "application/vnd.ms-office.activex+xml": {"source":"iana","compressible":true},
  "application/vnd.ms-officetheme": {"source":"iana","extensions":["thmx"]},
  "application/vnd.ms-opentype": {"source":"apache","compressible":true},
  "application/vnd.ms-outlook": {"compressible":false,"extensions":["msg"]},
  "application/vnd.ms-package.obfuscated-opentype": {"source":"apache"},
  "application/vnd.ms-pki.seccat": {"source":"apache","extensions":["cat"]},
  "application/vnd.ms-pki.stl": {"source":"apache","extensions":["stl"]},
  "application/vnd.ms-playready.initiator+xml": {"source":"iana","compressible":true},
  "application/vnd.ms-powerpoint": {"source":"iana","compressible":false,"extensions":["ppt","pps","pot"]},
  "application/vnd.ms-powerpoint.addin.macroenabled.12": {"source":"iana","extensions":["ppam"]},
  "application/vnd.ms-powerpoint.presentation.macroenabled.12": {"source":"iana","extensions":["pptm"]},
  "application/vnd.ms-powerpoint.slide.macroenabled.12": {"source":"iana","extensions":["sldm"]},
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12": {"source":"iana","extensions":["ppsm"]},
  "application/vnd.ms-powerpoint.template.macroenabled.12": {"source":"iana","extensions":["potm"]},
  "application/vnd.ms-printdevicecapabilities+xml": {"source":"iana","compressible":true},
  "application/vnd.ms-printing.printticket+xml": {"source":"apache","compressible":true},
  "application/vnd.ms-printschematicket+xml": {"source":"iana","compressible":true},
  "application/vnd.ms-project": {"source":"iana","extensions":["mpp","mpt"]},
  "application/vnd.ms-tnef": {"source":"iana"},
  "application/vnd.ms-visio.viewer": {"extensions":["vdx"]},
  "application/vnd.ms-windows.devicepairing": {"source":"iana"},
  "application/vnd.ms-windows.nwprinting.oob": {"source":"iana"},
  "application/vnd.ms-windows.printerpairing": {"source":"iana"},
  "application/vnd.ms-windows.wsd.oob": {"source":"iana"},
  "application/vnd.ms-wmdrm.lic-chlg-req": {"source":"iana"},
  "application/vnd.ms-wmdrm.lic-resp": {"source":"iana"},
  "application/vnd.ms-wmdrm.meter-chlg-req": {"source":"iana"},
  "application/vnd.ms-wmdrm.meter-resp": {"source":"iana"},
  "application/vnd.ms-word.document.macroenabled.12": {"source":"iana","extensions":["docm"]},
  "application/vnd.ms-word.template.macroenabled.12": {"source":"iana","extensions":["dotm"]},
  "application/vnd.ms-works": {"source":"iana","extensions":["wps","wks","wcm","wdb"]},
  "application/vnd.ms-wpl": {"source":"iana","extensions":["wpl"]},
  "application/vnd.ms-xpsdocument": {"source":"iana","compressible":false,"extensions":["xps"]},
  "application/vnd.msa-disk-image": {"source":"iana"},
  "application/vnd.mseq": {"source":"iana","extensions":["mseq"]},
  "application/vnd.msgpack": {"source":"iana"},
  "application/vnd.msign": {"source":"iana"},
  "application/vnd.multiad.creator": {"source":"iana"},
  "application/vnd.multiad.creator.cif": {"source":"iana"},
  "application/vnd.music-niff": {"source":"iana"},
  "application/vnd.musician": {"source":"iana","extensions":["mus"]},
  "application/vnd.muvee.style": {"source":"iana","extensions":["msty"]},
  "application/vnd.mynfc": {"source":"iana","extensions":["taglet"]},
  "application/vnd.nacamar.ybrid+json": {"source":"iana","compressible":true},
  "application/vnd.nato.bindingdataobject+cbor": {"source":"iana"},
  "application/vnd.nato.bindingdataobject+json": {"source":"iana","compressible":true},
  "application/vnd.nato.bindingdataobject+xml": {"source":"iana","compressible":true,"extensions":["bdo"]},
  "application/vnd.nato.openxmlformats-package.iepd+zip": {"source":"iana","compressible":false},
  "application/vnd.ncd.control": {"source":"iana"},
  "application/vnd.ncd.reference": {"source":"iana"},
  "application/vnd.nearst.inv+json": {"source":"iana","compressible":true},
  "application/vnd.nebumind.line": {"source":"iana"},
  "application/vnd.nervana": {"source":"iana"},
  "application/vnd.netfpx": {"source":"iana"},
  "application/vnd.neurolanguage.nlu": {"source":"iana","extensions":["nlu"]},
  "application/vnd.nimn": {"source":"iana"},
  "application/vnd.nintendo.nitro.rom": {"source":"iana"},
  "application/vnd.nintendo.snes.rom": {"source":"iana"},
  "application/vnd.nitf": {"source":"iana","extensions":["ntf","nitf"]},
  "application/vnd.noblenet-directory": {"source":"iana","extensions":["nnd"]},
  "application/vnd.noblenet-sealer": {"source":"iana","extensions":["nns"]},
  "application/vnd.noblenet-web": {"source":"iana","extensions":["nnw"]},
  "application/vnd.nokia.catalogs": {"source":"iana"},
  "application/vnd.nokia.conml+wbxml": {"source":"iana"},
  "application/vnd.nokia.conml+xml": {"source":"iana","compressible":true},
  "application/vnd.nokia.iptv.config+xml": {"source":"iana","compressible":true},
  "application/vnd.nokia.isds-radio-presets": {"source":"iana"},
  "application/vnd.nokia.landmark+wbxml": {"source":"iana"},
  "application/vnd.nokia.landmark+xml": {"source":"iana","compressible":true},
  "application/vnd.nokia.landmarkcollection+xml": {"source":"iana","compressible":true},
  "application/vnd.nokia.n-gage.ac+xml": {"source":"iana","compressible":true,"extensions":["ac"]},
  "application/vnd.nokia.n-gage.data": {"source":"iana","extensions":["ngdat"]},
  "application/vnd.nokia.n-gage.symbian.install": {"source":"apache","extensions":["n-gage"]},
  "application/vnd.nokia.ncd": {"source":"iana"},
  "application/vnd.nokia.pcd+wbxml": {"source":"iana"},
  "application/vnd.nokia.pcd+xml": {"source":"iana","compressible":true},
  "application/vnd.nokia.radio-preset": {"source":"iana","extensions":["rpst"]},
  "application/vnd.nokia.radio-presets": {"source":"iana","extensions":["rpss"]},
  "application/vnd.novadigm.edm": {"source":"iana","extensions":["edm"]},
  "application/vnd.novadigm.edx": {"source":"iana","extensions":["edx"]},
  "application/vnd.novadigm.ext": {"source":"iana","extensions":["ext"]},
  "application/vnd.ntt-local.content-share": {"source":"iana"},
  "application/vnd.ntt-local.file-transfer": {"source":"iana"},
  "application/vnd.ntt-local.ogw_remote-access": {"source":"iana"},
  "application/vnd.ntt-local.sip-ta_remote": {"source":"iana"},
  "application/vnd.ntt-local.sip-ta_tcp_stream": {"source":"iana"},
  "application/vnd.oai.workflows": {"source":"iana"},
  "application/vnd.oai.workflows+json": {"source":"iana","compressible":true},
  "application/vnd.oai.workflows+yaml": {"source":"iana"},
  "application/vnd.oasis.opendocument.base": {"source":"iana"},
  "application/vnd.oasis.opendocument.chart": {"source":"iana","extensions":["odc"]},
  "application/vnd.oasis.opendocument.chart-template": {"source":"iana","extensions":["otc"]},
  "application/vnd.oasis.opendocument.database": {"source":"apache","extensions":["odb"]},
  "application/vnd.oasis.opendocument.formula": {"source":"iana","extensions":["odf"]},
  "application/vnd.oasis.opendocument.formula-template": {"source":"iana","extensions":["odft"]},
  "application/vnd.oasis.opendocument.graphics": {"source":"iana","compressible":false,"extensions":["odg"]},
  "application/vnd.oasis.opendocument.graphics-template": {"source":"iana","extensions":["otg"]},
  "application/vnd.oasis.opendocument.image": {"source":"iana","extensions":["odi"]},
  "application/vnd.oasis.opendocument.image-template": {"source":"iana","extensions":["oti"]},
  "application/vnd.oasis.opendocument.presentation": {"source":"iana","compressible":false,"extensions":["odp"]},
  "application/vnd.oasis.opendocument.presentation-template": {"source":"iana","extensions":["otp"]},
  "application/vnd.oasis.opendocument.spreadsheet": {"source":"iana","compressible":false,"extensions":["ods"]},
  "application/vnd.oasis.opendocument.spreadsheet-template": {"source":"iana","extensions":["ots"]},
  "application/vnd.oasis.opendocument.text": {"source":"iana","compressible":false,"extensions":["odt"]},
  "application/vnd.oasis.opendocument.text-master": {"source":"iana","extensions":["odm"]},
  "application/vnd.oasis.opendocument.text-master-template": {"source":"iana"},
  "application/vnd.oasis.opendocument.text-template": {"source":"iana","extensions":["ott"]},
  "application/vnd.oasis.opendocument.text-web": {"source":"iana","extensions":["oth"]},
  "application/vnd.obn": {"source":"iana"},
  "application/vnd.ocf+cbor": {"source":"iana"},
  "application/vnd.oci.image.manifest.v1+json": {"source":"iana","compressible":true},
  "application/vnd.oftn.l10n+json": {"source":"iana","compressible":true},
  "application/vnd.oipf.contentaccessdownload+xml": {"source":"iana","compressible":true},
  "application/vnd.oipf.contentaccessstreaming+xml": {"source":"iana","compressible":true},
  "application/vnd.oipf.cspg-hexbinary": {"source":"iana"},
  "application/vnd.oipf.dae.svg+xml": {"source":"iana","compressible":true},
  "application/vnd.oipf.dae.xhtml+xml": {"source":"iana","compressible":true},
  "application/vnd.oipf.mippvcontrolmessage+xml": {"source":"iana","compressible":true},
  "application/vnd.oipf.pae.gem": {"source":"iana"},
  "application/vnd.oipf.spdiscovery+xml": {"source":"iana","compressible":true},
  "application/vnd.oipf.spdlist+xml": {"source":"iana","compressible":true},
  "application/vnd.oipf.ueprofile+xml": {"source":"iana","compressible":true},
  "application/vnd.oipf.userprofile+xml": {"source":"iana","compressible":true},
  "application/vnd.olpc-sugar": {"source":"iana","extensions":["xo"]},
  "application/vnd.oma-scws-config": {"source":"iana"},
  "application/vnd.oma-scws-http-request": {"source":"iana"},
  "application/vnd.oma-scws-http-response": {"source":"iana"},
  "application/vnd.oma.bcast.associated-procedure-parameter+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.bcast.drm-trigger+xml": {"source":"apache","compressible":true},
  "application/vnd.oma.bcast.imd+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.bcast.ltkm": {"source":"iana"},
  "application/vnd.oma.bcast.notification+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.bcast.provisioningtrigger": {"source":"iana"},
  "application/vnd.oma.bcast.sgboot": {"source":"iana"},
  "application/vnd.oma.bcast.sgdd+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.bcast.sgdu": {"source":"iana"},
  "application/vnd.oma.bcast.simple-symbol-container": {"source":"iana"},
  "application/vnd.oma.bcast.smartcard-trigger+xml": {"source":"apache","compressible":true},
  "application/vnd.oma.bcast.sprov+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.bcast.stkm": {"source":"iana"},
  "application/vnd.oma.cab-address-book+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.cab-feature-handler+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.cab-pcc+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.cab-subs-invite+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.cab-user-prefs+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.dcd": {"source":"iana"},
  "application/vnd.oma.dcdc": {"source":"iana"},
  "application/vnd.oma.dd2+xml": {"source":"iana","compressible":true,"extensions":["dd2"]},
  "application/vnd.oma.drm.risd+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.group-usage-list+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.lwm2m+cbor": {"source":"iana"},
  "application/vnd.oma.lwm2m+json": {"source":"iana","compressible":true},
  "application/vnd.oma.lwm2m+tlv": {"source":"iana"},
  "application/vnd.oma.pal+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.poc.detailed-progress-report+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.poc.final-report+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.poc.groups+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.poc.invocation-descriptor+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.poc.optimized-progress-report+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.push": {"source":"iana"},
  "application/vnd.oma.scidm.messages+xml": {"source":"iana","compressible":true},
  "application/vnd.oma.xcap-directory+xml": {"source":"iana","compressible":true},
  "application/vnd.omads-email+xml": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/vnd.omads-file+xml": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/vnd.omads-folder+xml": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/vnd.omaloc-supl-init": {"source":"iana"},
  "application/vnd.onepager": {"source":"iana"},
  "application/vnd.onepagertamp": {"source":"iana"},
  "application/vnd.onepagertamx": {"source":"iana"},
  "application/vnd.onepagertat": {"source":"iana"},
  "application/vnd.onepagertatp": {"source":"iana"},
  "application/vnd.onepagertatx": {"source":"iana"},
  "application/vnd.onvif.metadata": {"source":"iana"},
  "application/vnd.openblox.game+xml": {"source":"iana","compressible":true,"extensions":["obgx"]},
  "application/vnd.openblox.game-binary": {"source":"iana"},
  "application/vnd.openeye.oeb": {"source":"iana"},
  "application/vnd.openofficeorg.extension": {"source":"apache","extensions":["oxt"]},
  "application/vnd.openstreetmap.data+xml": {"source":"iana","compressible":true,"extensions":["osm"]},
  "application/vnd.opentimestamps.ots": {"source":"iana"},
  "application/vnd.openvpi.dspx+json": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.custom-properties+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.customxmlproperties+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.drawing+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.drawingml.chart+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.drawingml.diagramcolors+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.drawingml.diagramdata+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.drawingml.diagramlayout+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.drawingml.diagramstyle+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.extended-properties+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.presentationml.commentauthors+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.presentationml.comments+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.presentationml.handoutmaster+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.presentationml.notesmaster+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.presentationml.notesslide+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {"source":"iana","compressible":false,"extensions":["pptx"]},
  "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.presentationml.presprops+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.presentationml.slide": {"source":"iana","extensions":["sldx"]},
  "application/vnd.openxmlformats-officedocument.presentationml.slide+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.presentationml.slidelayout+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.presentationml.slidemaster+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow": {"source":"iana","extensions":["ppsx"]},
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.presentationml.slideupdateinfo+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.presentationml.tablestyles+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.presentationml.tags+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.presentationml.template": {"source":"iana","extensions":["potx"]},
  "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.presentationml.viewprops+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.calcchain+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.dialogsheet+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.externallink+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcachedefinition+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcacherecords+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivottable+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.querytable+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionheaders+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionlog+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedstrings+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {"source":"iana","compressible":false,"extensions":["xlsx"]},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheetmetadata+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.tablesinglecells+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template": {"source":"iana","extensions":["xltx"]},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.usernames+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.volatiledependencies+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.theme+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.themeoverride+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.vmldrawing": {"source":"iana"},
  "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {"source":"iana","compressible":false,"extensions":["docx"]},
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.wordprocessingml.fonttable+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template": {"source":"iana","extensions":["dotx"]},
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-officedocument.wordprocessingml.websettings+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-package.core-properties+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml": {"source":"iana","compressible":true},
  "application/vnd.openxmlformats-package.relationships+xml": {"source":"iana","compressible":true},
  "application/vnd.oracle.resource+json": {"source":"iana","compressible":true},
  "application/vnd.orange.indata": {"source":"iana"},
  "application/vnd.osa.netdeploy": {"source":"iana"},
  "application/vnd.osgeo.mapguide.package": {"source":"iana","extensions":["mgp"]},
  "application/vnd.osgi.bundle": {"source":"iana"},
  "application/vnd.osgi.dp": {"source":"iana","extensions":["dp"]},
  "application/vnd.osgi.subsystem": {"source":"iana","extensions":["esa"]},
  "application/vnd.otps.ct-kip+xml": {"source":"iana","compressible":true},
  "application/vnd.oxli.countgraph": {"source":"iana"},
  "application/vnd.pagerduty+json": {"source":"iana","compressible":true},
  "application/vnd.palm": {"source":"iana","extensions":["pdb","pqa","oprc"]},
  "application/vnd.panoply": {"source":"iana"},
  "application/vnd.paos.xml": {"source":"iana"},
  "application/vnd.patentdive": {"source":"iana"},
  "application/vnd.patientecommsdoc": {"source":"iana"},
  "application/vnd.pawaafile": {"source":"iana","extensions":["paw"]},
  "application/vnd.pcos": {"source":"iana"},
  "application/vnd.pg.format": {"source":"iana","extensions":["str"]},
  "application/vnd.pg.osasli": {"source":"iana","extensions":["ei6"]},
  "application/vnd.piaccess.application-licence": {"source":"iana"},
  "application/vnd.picsel": {"source":"iana","extensions":["efif"]},
  "application/vnd.pmi.widget": {"source":"iana","extensions":["wg"]},
  "application/vnd.poc.group-advertisement+xml": {"source":"iana","compressible":true},
  "application/vnd.pocketlearn": {"source":"iana","extensions":["plf"]},
  "application/vnd.powerbuilder6": {"source":"iana","extensions":["pbd"]},
  "application/vnd.powerbuilder6-s": {"source":"iana"},
  "application/vnd.powerbuilder7": {"source":"iana"},
  "application/vnd.powerbuilder7-s": {"source":"iana"},
  "application/vnd.powerbuilder75": {"source":"iana"},
  "application/vnd.powerbuilder75-s": {"source":"iana"},
  "application/vnd.preminet": {"source":"iana"},
  "application/vnd.previewsystems.box": {"source":"iana","extensions":["box"]},
  "application/vnd.procrate.brushset": {"extensions":["brushset"]},
  "application/vnd.procreate.brush": {"extensions":["brush"]},
  "application/vnd.procreate.dream": {"extensions":["drm"]},
  "application/vnd.proteus.magazine": {"source":"iana","extensions":["mgz"]},
  "application/vnd.psfs": {"source":"iana"},
  "application/vnd.pt.mundusmundi": {"source":"iana"},
  "application/vnd.publishare-delta-tree": {"source":"iana","extensions":["qps"]},
  "application/vnd.pvi.ptid1": {"source":"iana","extensions":["ptid"]},
  "application/vnd.pwg-multiplexed": {"source":"iana"},
  "application/vnd.pwg-xhtml-print+xml": {"source":"iana","compressible":true,"extensions":["xhtm"]},
  "application/vnd.qualcomm.brew-app-res": {"source":"iana"},
  "application/vnd.quarantainenet": {"source":"iana"},
  "application/vnd.quark.quarkxpress": {"source":"iana","extensions":["qxd","qxt","qwd","qwt","qxl","qxb"]},
  "application/vnd.quobject-quoxdocument": {"source":"iana"},
  "application/vnd.radisys.moml+xml": {"source":"iana","compressible":true},
  "application/vnd.radisys.msml+xml": {"source":"iana","compressible":true},
  "application/vnd.radisys.msml-audit+xml": {"source":"iana","compressible":true},
  "application/vnd.radisys.msml-audit-conf+xml": {"source":"iana","compressible":true},
  "application/vnd.radisys.msml-audit-conn+xml": {"source":"iana","compressible":true},
  "application/vnd.radisys.msml-audit-dialog+xml": {"source":"iana","compressible":true},
  "application/vnd.radisys.msml-audit-stream+xml": {"source":"iana","compressible":true},
  "application/vnd.radisys.msml-conf+xml": {"source":"iana","compressible":true},
  "application/vnd.radisys.msml-dialog+xml": {"source":"iana","compressible":true},
  "application/vnd.radisys.msml-dialog-base+xml": {"source":"iana","compressible":true},
  "application/vnd.radisys.msml-dialog-fax-detect+xml": {"source":"iana","compressible":true},
  "application/vnd.radisys.msml-dialog-fax-sendrecv+xml": {"source":"iana","compressible":true},
  "application/vnd.radisys.msml-dialog-group+xml": {"source":"iana","compressible":true},
  "application/vnd.radisys.msml-dialog-speech+xml": {"source":"iana","compressible":true},
  "application/vnd.radisys.msml-dialog-transform+xml": {"source":"iana","compressible":true},
  "application/vnd.rainstor.data": {"source":"iana"},
  "application/vnd.rapid": {"source":"iana"},
  "application/vnd.rar": {"source":"iana","extensions":["rar"]},
  "application/vnd.realvnc.bed": {"source":"iana","extensions":["bed"]},
  "application/vnd.recordare.musicxml": {"source":"iana","extensions":["mxl"]},
  "application/vnd.recordare.musicxml+xml": {"source":"iana","compressible":true,"extensions":["musicxml"]},
  "application/vnd.relpipe": {"source":"iana"},
  "application/vnd.renlearn.rlprint": {"source":"iana"},
  "application/vnd.resilient.logic": {"source":"iana"},
  "application/vnd.restful+json": {"source":"iana","compressible":true},
  "application/vnd.rig.cryptonote": {"source":"iana","extensions":["cryptonote"]},
  "application/vnd.rim.cod": {"source":"apache","extensions":["cod"]},
  "application/vnd.rn-realmedia": {"source":"apache","extensions":["rm"]},
  "application/vnd.rn-realmedia-vbr": {"source":"apache","extensions":["rmvb"]},
  "application/vnd.route66.link66+xml": {"source":"iana","compressible":true,"extensions":["link66"]},
  "application/vnd.rs-274x": {"source":"iana"},
  "application/vnd.ruckus.download": {"source":"iana"},
  "application/vnd.s3sms": {"source":"iana"},
  "application/vnd.sailingtracker.track": {"source":"iana","extensions":["st"]},
  "application/vnd.sar": {"source":"iana"},
  "application/vnd.sbm.cid": {"source":"iana"},
  "application/vnd.sbm.mid2": {"source":"iana"},
  "application/vnd.scribus": {"source":"iana"},
  "application/vnd.sealed.3df": {"source":"iana"},
  "application/vnd.sealed.csf": {"source":"iana"},
  "application/vnd.sealed.doc": {"source":"iana"},
  "application/vnd.sealed.eml": {"source":"iana"},
  "application/vnd.sealed.mht": {"source":"iana"},
  "application/vnd.sealed.net": {"source":"iana"},
  "application/vnd.sealed.ppt": {"source":"iana"},
  "application/vnd.sealed.tiff": {"source":"iana"},
  "application/vnd.sealed.xls": {"source":"iana"},
  "application/vnd.sealedmedia.softseal.html": {"source":"iana"},
  "application/vnd.sealedmedia.softseal.pdf": {"source":"iana"},
  "application/vnd.seemail": {"source":"iana","extensions":["see"]},
  "application/vnd.seis+json": {"source":"iana","compressible":true},
  "application/vnd.sema": {"source":"iana","extensions":["sema"]},
  "application/vnd.semd": {"source":"iana","extensions":["semd"]},
  "application/vnd.semf": {"source":"iana","extensions":["semf"]},
  "application/vnd.shade-save-file": {"source":"iana"},
  "application/vnd.shana.informed.formdata": {"source":"iana","extensions":["ifm"]},
  "application/vnd.shana.informed.formtemplate": {"source":"iana","extensions":["itp"]},
  "application/vnd.shana.informed.interchange": {"source":"iana","extensions":["iif"]},
  "application/vnd.shana.informed.package": {"source":"iana","extensions":["ipk"]},
  "application/vnd.shootproof+json": {"source":"iana","compressible":true},
  "application/vnd.shopkick+json": {"source":"iana","compressible":true},
  "application/vnd.shp": {"source":"iana"},
  "application/vnd.shx": {"source":"iana"},
  "application/vnd.sigrok.session": {"source":"iana"},
  "application/vnd.simtech-mindmapper": {"source":"iana","extensions":["twd","twds"]},
  "application/vnd.siren+json": {"source":"iana","compressible":true},
  "application/vnd.sketchometry": {"source":"iana"},
  "application/vnd.smaf": {"source":"iana","extensions":["mmf"]},
  "application/vnd.smart.notebook": {"source":"iana"},
  "application/vnd.smart.teacher": {"source":"iana","extensions":["teacher"]},
  "application/vnd.smintio.portals.archive": {"source":"iana"},
  "application/vnd.snesdev-page-table": {"source":"iana"},
  "application/vnd.software602.filler.form+xml": {"source":"iana","compressible":true,"extensions":["fo"]},
  "application/vnd.software602.filler.form-xml-zip": {"source":"iana"},
  "application/vnd.solent.sdkm+xml": {"source":"iana","compressible":true,"extensions":["sdkm","sdkd"]},
  "application/vnd.spotfire.dxp": {"source":"iana","extensions":["dxp"]},
  "application/vnd.spotfire.sfs": {"source":"iana","extensions":["sfs"]},
  "application/vnd.sqlite3": {"source":"iana"},
  "application/vnd.sss-cod": {"source":"iana"},
  "application/vnd.sss-dtf": {"source":"iana"},
  "application/vnd.sss-ntf": {"source":"iana"},
  "application/vnd.stardivision.calc": {"source":"apache","extensions":["sdc"]},
  "application/vnd.stardivision.draw": {"source":"apache","extensions":["sda"]},
  "application/vnd.stardivision.impress": {"source":"apache","extensions":["sdd"]},
  "application/vnd.stardivision.math": {"source":"apache","extensions":["smf"]},
  "application/vnd.stardivision.writer": {"source":"apache","extensions":["sdw","vor"]},
  "application/vnd.stardivision.writer-global": {"source":"apache","extensions":["sgl"]},
  "application/vnd.stepmania.package": {"source":"iana","extensions":["smzip"]},
  "application/vnd.stepmania.stepchart": {"source":"iana","extensions":["sm"]},
  "application/vnd.street-stream": {"source":"iana"},
  "application/vnd.sun.wadl+xml": {"source":"iana","compressible":true,"extensions":["wadl"]},
  "application/vnd.sun.xml.calc": {"source":"apache","extensions":["sxc"]},
  "application/vnd.sun.xml.calc.template": {"source":"apache","extensions":["stc"]},
  "application/vnd.sun.xml.draw": {"source":"apache","extensions":["sxd"]},
  "application/vnd.sun.xml.draw.template": {"source":"apache","extensions":["std"]},
  "application/vnd.sun.xml.impress": {"source":"apache","extensions":["sxi"]},
  "application/vnd.sun.xml.impress.template": {"source":"apache","extensions":["sti"]},
  "application/vnd.sun.xml.math": {"source":"apache","extensions":["sxm"]},
  "application/vnd.sun.xml.writer": {"source":"apache","extensions":["sxw"]},
  "application/vnd.sun.xml.writer.global": {"source":"apache","extensions":["sxg"]},
  "application/vnd.sun.xml.writer.template": {"source":"apache","extensions":["stw"]},
  "application/vnd.sus-calendar": {"source":"iana","extensions":["sus","susp"]},
  "application/vnd.svd": {"source":"iana","extensions":["svd"]},
  "application/vnd.swiftview-ics": {"source":"iana"},
  "application/vnd.sybyl.mol2": {"source":"iana"},
  "application/vnd.sycle+xml": {"source":"iana","compressible":true},
  "application/vnd.syft+json": {"source":"iana","compressible":true},
  "application/vnd.symbian.install": {"source":"apache","extensions":["sis","sisx"]},
  "application/vnd.syncml+xml": {"source":"iana","charset":"UTF-8","compressible":true,"extensions":["xsm"]},
  "application/vnd.syncml.dm+wbxml": {"source":"iana","charset":"UTF-8","extensions":["bdm"]},
  "application/vnd.syncml.dm+xml": {"source":"iana","charset":"UTF-8","compressible":true,"extensions":["xdm"]},
  "application/vnd.syncml.dm.notification": {"source":"iana"},
  "application/vnd.syncml.dmddf+wbxml": {"source":"iana"},
  "application/vnd.syncml.dmddf+xml": {"source":"iana","charset":"UTF-8","compressible":true,"extensions":["ddf"]},
  "application/vnd.syncml.dmtnds+wbxml": {"source":"iana"},
  "application/vnd.syncml.dmtnds+xml": {"source":"iana","charset":"UTF-8","compressible":true},
  "application/vnd.syncml.ds.notification": {"source":"iana"},
  "application/vnd.tableschema+json": {"source":"iana","compressible":true},
  "application/vnd.tao.intent-module-archive": {"source":"iana","extensions":["tao"]},
  "application/vnd.tcpdump.pcap": {"source":"iana","extensions":["pcap","cap","dmp"]},
  "application/vnd.think-cell.ppttc+json": {"source":"iana","compressible":true},
  "application/vnd.tmd.mediaflex.api+xml": {"source":"iana","compressible":true},
  "application/vnd.tml": {"source":"iana"},
  "application/vnd.tmobile-livetv": {"source":"iana","extensions":["tmo"]},
  "application/vnd.tri.onesource": {"source":"iana"},
  "application/vnd.trid.tpt": {"source":"iana","extensions":["tpt"]},
  "application/vnd.triscape.mxs": {"source":"iana","extensions":["mxs"]},
  "application/vnd.trueapp": {"source":"iana","extensions":["tra"]},
  "application/vnd.truedoc": {"source":"iana"},
  "application/vnd.ubisoft.webplayer": {"source":"iana"},
  "application/vnd.ufdl": {"source":"iana","extensions":["ufd","ufdl"]},
  "application/vnd.uic.osdm+json": {"source":"iana","compressible":true},
  "application/vnd.uiq.theme": {"source":"iana","extensions":["utz"]},
  "application/vnd.umajin": {"source":"iana","extensions":["umj"]},
  "application/vnd.unity": {"source":"iana","extensions":["unityweb"]},
  "application/vnd.uoml+xml": {"source":"iana","compressible":true,"extensions":["uoml","uo"]},
  "application/vnd.uplanet.alert": {"source":"iana"},
  "application/vnd.uplanet.alert-wbxml": {"source":"iana"},
  "application/vnd.uplanet.bearer-choice": {"source":"iana"},
  "application/vnd.uplanet.bearer-choice-wbxml": {"source":"iana"},
  "application/vnd.uplanet.cacheop": {"source":"iana"},
  "application/vnd.uplanet.cacheop-wbxml": {"source":"iana"},
  "application/vnd.uplanet.channel": {"source":"iana"},
  "application/vnd.uplanet.channel-wbxml": {"source":"iana"},
  "application/vnd.uplanet.list": {"source":"iana"},
  "application/vnd.uplanet.list-wbxml": {"source":"iana"},
  "application/vnd.uplanet.listcmd": {"source":"iana"},
  "application/vnd.uplanet.listcmd-wbxml": {"source":"iana"},
  "application/vnd.uplanet.signal": {"source":"iana"},
  "application/vnd.uri-map": {"source":"iana"},
  "application/vnd.valve.source.material": {"source":"iana"},
  "application/vnd.vcx": {"source":"iana","extensions":["vcx"]},
  "application/vnd.vd-study": {"source":"iana"},
  "application/vnd.vectorworks": {"source":"iana"},
  "application/vnd.vel+json": {"source":"iana","compressible":true},
  "application/vnd.veraison.tsm-report+cbor": {"source":"iana"},
  "application/vnd.veraison.tsm-report+json": {"source":"iana","compressible":true},
  "application/vnd.verimatrix.vcas": {"source":"iana"},
  "application/vnd.veritone.aion+json": {"source":"iana","compressible":true},
  "application/vnd.veryant.thin": {"source":"iana"},
  "application/vnd.ves.encrypted": {"source":"iana"},
  "application/vnd.vidsoft.vidconference": {"source":"iana"},
  "application/vnd.visio": {"source":"iana","extensions":["vsd","vst","vss","vsw","vsdx","vtx"]},
  "application/vnd.visionary": {"source":"iana","extensions":["vis"]},
  "application/vnd.vividence.scriptfile": {"source":"iana"},
  "application/vnd.vocalshaper.vsp4": {"source":"iana"},
  "application/vnd.vsf": {"source":"iana","extensions":["vsf"]},
  "application/vnd.wap.sic": {"source":"iana"},
  "application/vnd.wap.slc": {"source":"iana"},
  "application/vnd.wap.wbxml": {"source":"iana","charset":"UTF-8","extensions":["wbxml"]},
  "application/vnd.wap.wmlc": {"source":"iana","extensions":["wmlc"]},
  "application/vnd.wap.wmlscriptc": {"source":"iana","extensions":["wmlsc"]},
  "application/vnd.wasmflow.wafl": {"source":"iana"},
  "application/vnd.webturbo": {"source":"iana","extensions":["wtb"]},
  "application/vnd.wfa.dpp": {"source":"iana"},
  "application/vnd.wfa.p2p": {"source":"iana"},
  "application/vnd.wfa.wsc": {"source":"iana"},
  "application/vnd.windows.devicepairing": {"source":"iana"},
  "application/vnd.wmc": {"source":"iana"},
  "application/vnd.wmf.bootstrap": {"source":"iana"},
  "application/vnd.wolfram.mathematica": {"source":"iana"},
  "application/vnd.wolfram.mathematica.package": {"source":"iana"},
  "application/vnd.wolfram.player": {"source":"iana","extensions":["nbp"]},
  "application/vnd.wordlift": {"source":"iana"},
  "application/vnd.wordperfect": {"source":"iana","extensions":["wpd"]},
  "application/vnd.wqd": {"source":"iana","extensions":["wqd"]},
  "application/vnd.wrq-hp3000-labelled": {"source":"iana"},
  "application/vnd.wt.stf": {"source":"iana","extensions":["stf"]},
  "application/vnd.wv.csp+wbxml": {"source":"iana"},
  "application/vnd.wv.csp+xml": {"source":"iana","compressible":true},
  "application/vnd.wv.ssp+xml": {"source":"iana","compressible":true},
  "application/vnd.xacml+json": {"source":"iana","compressible":true},
  "application/vnd.xara": {"source":"iana","extensions":["xar"]},
  "application/vnd.xarin.cpj": {"source":"iana"},
  "application/vnd.xecrets-encrypted": {"source":"iana"},
  "application/vnd.xfdl": {"source":"iana","extensions":["xfdl"]},
  "application/vnd.xfdl.webform": {"source":"iana"},
  "application/vnd.xmi+xml": {"source":"iana","compressible":true},
  "application/vnd.xmpie.cpkg": {"source":"iana"},
  "application/vnd.xmpie.dpkg": {"source":"iana"},
  "application/vnd.xmpie.plan": {"source":"iana"},
  "application/vnd.xmpie.ppkg": {"source":"iana"},
  "application/vnd.xmpie.xlim": {"source":"iana"},
  "application/vnd.yamaha.hv-dic": {"source":"iana","extensions":["hvd"]},
  "application/vnd.yamaha.hv-script": {"source":"iana","extensions":["hvs"]},
  "application/vnd.yamaha.hv-voice": {"source":"iana","extensions":["hvp"]},
  "application/vnd.yamaha.openscoreformat": {"source":"iana","extensions":["osf"]},
  "application/vnd.yamaha.openscoreformat.osfpvg+xml": {"source":"iana","compressible":true,"extensions":["osfpvg"]},
  "application/vnd.yamaha.remote-setup": {"source":"iana"},
  "application/vnd.yamaha.smaf-audio": {"source":"iana","extensions":["saf"]},
  "application/vnd.yamaha.smaf-phrase": {"source":"iana","extensions":["spf"]},
  "application/vnd.yamaha.through-ngn": {"source":"iana"},
  "application/vnd.yamaha.tunnel-udpencap": {"source":"iana"},
  "application/vnd.yaoweme": {"source":"iana"},
  "application/vnd.yellowriver-custom-menu": {"source":"iana","extensions":["cmp"]},
  "application/vnd.zul": {"source":"iana","extensions":["zir","zirz"]},
  "application/vnd.zzazz.deck+xml": {"source":"iana","compressible":true,"extensions":["zaz"]},
  "application/voicexml+xml": {"source":"iana","compressible":true,"extensions":["vxml"]},
  "application/voucher-cms+json": {"source":"iana","compressible":true},
  "application/voucher-jws+json": {"source":"iana","compressible":true},
  "application/vp": {"source":"iana"},
  "application/vp+cose": {"source":"iana"},
  "application/vp+jwt": {"source":"iana"},
  "application/vq-rtcpxr": {"source":"iana"},
  "application/wasm": {"source":"iana","compressible":true,"extensions":["wasm"]},
  "application/watcherinfo+xml": {"source":"iana","compressible":true,"extensions":["wif"]},
  "application/webpush-options+json": {"source":"iana","compressible":true},
  "application/whoispp-query": {"source":"iana"},
  "application/whoispp-response": {"source":"iana"},
  "application/widget": {"source":"iana","extensions":["wgt"]},
  "application/winhlp": {"source":"apache","extensions":["hlp"]},
  "application/wita": {"source":"iana"},
  "application/wordperfect5.1": {"source":"iana"},
  "application/wsdl+xml": {"source":"iana","compressible":true,"extensions":["wsdl"]},
  "application/wspolicy+xml": {"source":"iana","compressible":true,"extensions":["wspolicy"]},
  "application/x-7z-compressed": {"source":"apache","compressible":false,"extensions":["7z"]},
  "application/x-abiword": {"source":"apache","extensions":["abw"]},
  "application/x-ace-compressed": {"source":"apache","extensions":["ace"]},
  "application/x-amf": {"source":"apache"},
  "application/x-apple-diskimage": {"source":"apache","extensions":["dmg"]},
  "application/x-arj": {"compressible":false,"extensions":["arj"]},
  "application/x-authorware-bin": {"source":"apache","extensions":["aab","x32","u32","vox"]},
  "application/x-authorware-map": {"source":"apache","extensions":["aam"]},
  "application/x-authorware-seg": {"source":"apache","extensions":["aas"]},
  "application/x-bcpio": {"source":"apache","extensions":["bcpio"]},
  "application/x-bdoc": {"compressible":false,"extensions":["bdoc"]},
  "application/x-bittorrent": {"source":"apache","extensions":["torrent"]},
  "application/x-blender": {"extensions":["blend"]},
  "application/x-blorb": {"source":"apache","extensions":["blb","blorb"]},
  "application/x-bzip": {"source":"apache","compressible":false,"extensions":["bz"]},
  "application/x-bzip2": {"source":"apache","compressible":false,"extensions":["bz2","boz"]},
  "application/x-cbr": {"source":"apache","extensions":["cbr","cba","cbt","cbz","cb7"]},
  "application/x-cdlink": {"source":"apache","extensions":["vcd"]},
  "application/x-cfs-compressed": {"source":"apache","extensions":["cfs"]},
  "application/x-chat": {"source":"apache","extensions":["chat"]},
  "application/x-chess-pgn": {"source":"apache","extensions":["pgn"]},
  "application/x-chrome-extension": {"extensions":["crx"]},
  "application/x-cocoa": {"source":"nginx","extensions":["cco"]},
  "application/x-compress": {"source":"apache"},
  "application/x-compressed": {"extensions":["rar"]},
  "application/x-conference": {"source":"apache","extensions":["nsc"]},
  "application/x-cpio": {"source":"apache","extensions":["cpio"]},
  "application/x-csh": {"source":"apache","extensions":["csh"]},
  "application/x-deb": {"compressible":false},
  "application/x-debian-package": {"source":"apache","extensions":["deb","udeb"]},
  "application/x-dgc-compressed": {"source":"apache","extensions":["dgc"]},
  "application/x-director": {"source":"apache","extensions":["dir","dcr","dxr","cst","cct","cxt","w3d","fgd","swa"]},
  "application/x-doom": {"source":"apache","extensions":["wad"]},
  "application/x-dtbncx+xml": {"source":"apache","compressible":true,"extensions":["ncx"]},
  "application/x-dtbook+xml": {"source":"apache","compressible":true,"extensions":["dtb"]},
  "application/x-dtbresource+xml": {"source":"apache","compressible":true,"extensions":["res"]},
  "application/x-dvi": {"source":"apache","compressible":false,"extensions":["dvi"]},
  "application/x-envoy": {"source":"apache","extensions":["evy"]},
  "application/x-eva": {"source":"apache","extensions":["eva"]},
  "application/x-font-bdf": {"source":"apache","extensions":["bdf"]},
  "application/x-font-dos": {"source":"apache"},
  "application/x-font-framemaker": {"source":"apache"},
  "application/x-font-ghostscript": {"source":"apache","extensions":["gsf"]},
  "application/x-font-libgrx": {"source":"apache"},
  "application/x-font-linux-psf": {"source":"apache","extensions":["psf"]},
  "application/x-font-pcf": {"source":"apache","extensions":["pcf"]},
  "application/x-font-snf": {"source":"apache","extensions":["snf"]},
  "application/x-font-speedo": {"source":"apache"},
  "application/x-font-sunos-news": {"source":"apache"},
  "application/x-font-type1": {"source":"apache","extensions":["pfa","pfb","pfm","afm"]},
  "application/x-font-vfont": {"source":"apache"},
  "application/x-freearc": {"source":"apache","extensions":["arc"]},
  "application/x-futuresplash": {"source":"apache","extensions":["spl"]},
  "application/x-gca-compressed": {"source":"apache","extensions":["gca"]},
  "application/x-glulx": {"source":"apache","extensions":["ulx"]},
  "application/x-gnumeric": {"source":"apache","extensions":["gnumeric"]},
  "application/x-gramps-xml": {"source":"apache","extensions":["gramps"]},
  "application/x-gtar": {"source":"apache","extensions":["gtar"]},
  "application/x-gzip": {"source":"apache"},
  "application/x-hdf": {"source":"apache","extensions":["hdf"]},
  "application/x-httpd-php": {"compressible":true,"extensions":["php"]},
  "application/x-install-instructions": {"source":"apache","extensions":["install"]},
  "application/x-ipynb+json": {"compressible":true,"extensions":["ipynb"]},
  "application/x-iso9660-image": {"source":"apache","extensions":["iso"]},
  "application/x-iwork-keynote-sffkey": {"extensions":["key"]},
  "application/x-iwork-numbers-sffnumbers": {"extensions":["numbers"]},
  "application/x-iwork-pages-sffpages": {"extensions":["pages"]},
  "application/x-java-archive-diff": {"source":"nginx","extensions":["jardiff"]},
  "application/x-java-jnlp-file": {"source":"apache","compressible":false,"extensions":["jnlp"]},
  "application/x-javascript": {"compressible":true},
  "application/x-keepass2": {"extensions":["kdbx"]},
  "application/x-latex": {"source":"apache","compressible":false,"extensions":["latex"]},
  "application/x-lua-bytecode": {"extensions":["luac"]},
  "application/x-lzh-compressed": {"source":"apache","extensions":["lzh","lha"]},
  "application/x-makeself": {"source":"nginx","extensions":["run"]},
  "application/x-mie": {"source":"apache","extensions":["mie"]},
  "application/x-mobipocket-ebook": {"source":"apache","extensions":["prc","mobi"]},
  "application/x-mpegurl": {"compressible":false},
  "application/x-ms-application": {"source":"apache","extensions":["application"]},
  "application/x-ms-shortcut": {"source":"apache","extensions":["lnk"]},
  "application/x-ms-wmd": {"source":"apache","extensions":["wmd"]},
  "application/x-ms-wmz": {"source":"apache","extensions":["wmz"]},
  "application/x-ms-xbap": {"source":"apache","extensions":["xbap"]},
  "application/x-msaccess": {"source":"apache","extensions":["mdb"]},
  "application/x-msbinder": {"source":"apache","extensions":["obd"]},
  "application/x-mscardfile": {"source":"apache","extensions":["crd"]},
  "application/x-msclip": {"source":"apache","extensions":["clp"]},
  "application/x-msdos-program": {"extensions":["exe"]},
  "application/x-msdownload": {"source":"apache","extensions":["exe","dll","com","bat","msi"]},
  "application/x-msmediaview": {"source":"apache","extensions":["mvb","m13","m14"]},
  "application/x-msmetafile": {"source":"apache","extensions":["wmf","wmz","emf","emz"]},
  "application/x-msmoney": {"source":"apache","extensions":["mny"]},
  "application/x-mspublisher": {"source":"apache","extensions":["pub"]},
  "application/x-msschedule": {"source":"apache","extensions":["scd"]},
  "application/x-msterminal": {"source":"apache","extensions":["trm"]},
  "application/x-mswrite": {"source":"apache","extensions":["wri"]},
  "application/x-netcdf": {"source":"apache","extensions":["nc","cdf"]},
  "application/x-ns-proxy-autoconfig": {"compressible":true,"extensions":["pac"]},
  "application/x-nzb": {"source":"apache","extensions":["nzb"]},
  "application/x-perl": {"source":"nginx","extensions":["pl","pm"]},
  "application/x-pilot": {"source":"nginx","extensions":["prc","pdb"]},
  "application/x-pkcs12": {"source":"apache","compressible":false,"extensions":["p12","pfx"]},
  "application/x-pkcs7-certificates": {"source":"apache","extensions":["p7b","spc"]},
  "application/x-pkcs7-certreqresp": {"source":"apache","extensions":["p7r"]},
  "application/x-pki-message": {"source":"iana"},
  "application/x-rar-compressed": {"source":"apache","compressible":false,"extensions":["rar"]},
  "application/x-redhat-package-manager": {"source":"nginx","extensions":["rpm"]},
  "application/x-research-info-systems": {"source":"apache","extensions":["ris"]},
  "application/x-sea": {"source":"nginx","extensions":["sea"]},
  "application/x-sh": {"source":"apache","compressible":true,"extensions":["sh"]},
  "application/x-shar": {"source":"apache","extensions":["shar"]},
  "application/x-shockwave-flash": {"source":"apache","compressible":false,"extensions":["swf"]},
  "application/x-silverlight-app": {"source":"apache","extensions":["xap"]},
  "application/x-sql": {"source":"apache","extensions":["sql"]},
  "application/x-stuffit": {"source":"apache","compressible":false,"extensions":["sit"]},
  "application/x-stuffitx": {"source":"apache","extensions":["sitx"]},
  "application/x-subrip": {"source":"apache","extensions":["srt"]},
  "application/x-sv4cpio": {"source":"apache","extensions":["sv4cpio"]},
  "application/x-sv4crc": {"source":"apache","extensions":["sv4crc"]},
  "application/x-t3vm-image": {"source":"apache","extensions":["t3"]},
  "application/x-tads": {"source":"apache","extensions":["gam"]},
  "application/x-tar": {"source":"apache","compressible":true,"extensions":["tar"]},
  "application/x-tcl": {"source":"apache","extensions":["tcl","tk"]},
  "application/x-tex": {"source":"apache","extensions":["tex"]},
  "application/x-tex-tfm": {"source":"apache","extensions":["tfm"]},
  "application/x-texinfo": {"source":"apache","extensions":["texinfo","texi"]},
  "application/x-tgif": {"source":"apache","extensions":["obj"]},
  "application/x-ustar": {"source":"apache","extensions":["ustar"]},
  "application/x-virtualbox-hdd": {"compressible":true,"extensions":["hdd"]},
  "application/x-virtualbox-ova": {"compressible":true,"extensions":["ova"]},
  "application/x-virtualbox-ovf": {"compressible":true,"extensions":["ovf"]},
  "application/x-virtualbox-vbox": {"compressible":true,"extensions":["vbox"]},
  "application/x-virtualbox-vbox-extpack": {"compressible":false,"extensions":["vbox-extpack"]},
  "application/x-virtualbox-vdi": {"compressible":true,"extensions":["vdi"]},
  "application/x-virtualbox-vhd": {"compressible":true,"extensions":["vhd"]},
  "application/x-virtualbox-vmdk": {"compressible":true,"extensions":["vmdk"]},
  "application/x-wais-source": {"source":"apache","extensions":["src"]},
  "application/x-web-app-manifest+json": {"compressible":true,"extensions":["webapp"]},
  "application/x-www-form-urlencoded": {"source":"iana","compressible":true},
  "application/x-x509-ca-cert": {"source":"iana","extensions":["der","crt","pem"]},
  "application/x-x509-ca-ra-cert": {"source":"iana"},
  "application/x-x509-next-ca-cert": {"source":"iana"},
  "application/x-xfig": {"source":"apache","extensions":["fig"]},
  "application/x-xliff+xml": {"source":"apache","compressible":true,"extensions":["xlf"]},
  "application/x-xpinstall": {"source":"apache","compressible":false,"extensions":["xpi"]},
  "application/x-xz": {"source":"apache","extensions":["xz"]},
  "application/x-zip-compressed": {"extensions":["zip"]},
  "application/x-zmachine": {"source":"apache","extensions":["z1","z2","z3","z4","z5","z6","z7","z8"]},
  "application/x400-bp": {"source":"iana"},
  "application/xacml+xml": {"source":"iana","compressible":true},
  "application/xaml+xml": {"source":"apache","compressible":true,"extensions":["xaml"]},
  "application/xcap-att+xml": {"source":"iana","compressible":true,"extensions":["xav"]},
  "application/xcap-caps+xml": {"source":"iana","compressible":true,"extensions":["xca"]},
  "application/xcap-diff+xml": {"source":"iana","compressible":true,"extensions":["xdf"]},
  "application/xcap-el+xml": {"source":"iana","compressible":true,"extensions":["xel"]},
  "application/xcap-error+xml": {"source":"iana","compressible":true},
  "application/xcap-ns+xml": {"source":"iana","compressible":true,"extensions":["xns"]},
  "application/xcon-conference-info+xml": {"source":"iana","compressible":true},
  "application/xcon-conference-info-diff+xml": {"source":"iana","compressible":true},
  "application/xenc+xml": {"source":"iana","compressible":true,"extensions":["xenc"]},
  "application/xfdf": {"source":"iana","extensions":["xfdf"]},
  "application/xhtml+xml": {"source":"iana","compressible":true,"extensions":["xhtml","xht"]},
  "application/xhtml-voice+xml": {"source":"apache","compressible":true},
  "application/xliff+xml": {"source":"iana","compressible":true,"extensions":["xlf"]},
  "application/xml": {"source":"iana","compressible":true,"extensions":["xml","xsl","xsd","rng"]},
  "application/xml-dtd": {"source":"iana","compressible":true,"extensions":["dtd"]},
  "application/xml-external-parsed-entity": {"source":"iana"},
  "application/xml-patch+xml": {"source":"iana","compressible":true},
  "application/xmpp+xml": {"source":"iana","compressible":true},
  "application/xop+xml": {"source":"iana","compressible":true,"extensions":["xop"]},
  "application/xproc+xml": {"source":"apache","compressible":true,"extensions":["xpl"]},
  "application/xslt+xml": {"source":"iana","compressible":true,"extensions":["xsl","xslt"]},
  "application/xspf+xml": {"source":"apache","compressible":true,"extensions":["xspf"]},
  "application/xv+xml": {"source":"iana","compressible":true,"extensions":["mxml","xhvml","xvml","xvm"]},
  "application/yaml": {"source":"iana"},
  "application/yang": {"source":"iana","extensions":["yang"]},
  "application/yang-data+cbor": {"source":"iana"},
  "application/yang-data+json": {"source":"iana","compressible":true},
  "application/yang-data+xml": {"source":"iana","compressible":true},
  "application/yang-patch+json": {"source":"iana","compressible":true},
  "application/yang-patch+xml": {"source":"iana","compressible":true},
  "application/yang-sid+json": {"source":"iana","compressible":true},
  "application/yin+xml": {"source":"iana","compressible":true,"extensions":["yin"]},
  "application/zip": {"source":"iana","compressible":false,"extensions":["zip"]},
  "application/zip+dotlottie": {"extensions":["lottie"]},
  "application/zlib": {"source":"iana"},
  "application/zstd": {"source":"iana"},
  "audio/1d-interleaved-parityfec": {"source":"iana"},
  "audio/32kadpcm": {"source":"iana"},
  "audio/3gpp": {"source":"iana","compressible":false,"extensions":["3gpp"]},
  "audio/3gpp2": {"source":"iana"},
  "audio/aac": {"source":"iana","extensions":["adts","aac"]},
  "audio/ac3": {"source":"iana"},
  "audio/adpcm": {"source":"apache","extensions":["adp"]},
  "audio/amr": {"source":"iana","extensions":["amr"]},
  "audio/amr-wb": {"source":"iana"},
  "audio/amr-wb+": {"source":"iana"},
  "audio/aptx": {"source":"iana"},
  "audio/asc": {"source":"iana"},
  "audio/atrac-advanced-lossless": {"source":"iana"},
  "audio/atrac-x": {"source":"iana"},
  "audio/atrac3": {"source":"iana"},
  "audio/basic": {"source":"iana","compressible":false,"extensions":["au","snd"]},
  "audio/bv16": {"source":"iana"},
  "audio/bv32": {"source":"iana"},
  "audio/clearmode": {"source":"iana"},
  "audio/cn": {"source":"iana"},
  "audio/dat12": {"source":"iana"},
  "audio/dls": {"source":"iana"},
  "audio/dsr-es201108": {"source":"iana"},
  "audio/dsr-es202050": {"source":"iana"},
  "audio/dsr-es202211": {"source":"iana"},
  "audio/dsr-es202212": {"source":"iana"},
  "audio/dv": {"source":"iana"},
  "audio/dvi4": {"source":"iana"},
  "audio/eac3": {"source":"iana"},
  "audio/encaprtp": {"source":"iana"},
  "audio/evrc": {"source":"iana"},
  "audio/evrc-qcp": {"source":"iana"},
  "audio/evrc0": {"source":"iana"},
  "audio/evrc1": {"source":"iana"},
  "audio/evrcb": {"source":"iana"},
  "audio/evrcb0": {"source":"iana"},
  "audio/evrcb1": {"source":"iana"},
  "audio/evrcnw": {"source":"iana"},
  "audio/evrcnw0": {"source":"iana"},
  "audio/evrcnw1": {"source":"iana"},
  "audio/evrcwb": {"source":"iana"},
  "audio/evrcwb0": {"source":"iana"},
  "audio/evrcwb1": {"source":"iana"},
  "audio/evs": {"source":"iana"},
  "audio/flac": {"source":"iana"},
  "audio/flexfec": {"source":"iana"},
  "audio/fwdred": {"source":"iana"},
  "audio/g711-0": {"source":"iana"},
  "audio/g719": {"source":"iana"},
  "audio/g722": {"source":"iana"},
  "audio/g7221": {"source":"iana"},
  "audio/g723": {"source":"iana"},
  "audio/g726-16": {"source":"iana"},
  "audio/g726-24": {"source":"iana"},
  "audio/g726-32": {"source":"iana"},
  "audio/g726-40": {"source":"iana"},
  "audio/g728": {"source":"iana"},
  "audio/g729": {"source":"iana"},
  "audio/g7291": {"source":"iana"},
  "audio/g729d": {"source":"iana"},
  "audio/g729e": {"source":"iana"},
  "audio/gsm": {"source":"iana"},
  "audio/gsm-efr": {"source":"iana"},
  "audio/gsm-hr-08": {"source":"iana"},
  "audio/ilbc": {"source":"iana"},
  "audio/ip-mr_v2.5": {"source":"iana"},
  "audio/isac": {"source":"apache"},
  "audio/l16": {"source":"iana"},
  "audio/l20": {"source":"iana"},
  "audio/l24": {"source":"iana","compressible":false},
  "audio/l8": {"source":"iana"},
  "audio/lpc": {"source":"iana"},
  "audio/matroska": {"source":"iana"},
  "audio/melp": {"source":"iana"},
  "audio/melp1200": {"source":"iana"},
  "audio/melp2400": {"source":"iana"},
  "audio/melp600": {"source":"iana"},
  "audio/mhas": {"source":"iana"},
  "audio/midi": {"source":"apache","extensions":["mid","midi","kar","rmi"]},
  "audio/midi-clip": {"source":"iana"},
  "audio/mobile-xmf": {"source":"iana","extensions":["mxmf"]},
  "audio/mp3": {"compressible":false,"extensions":["mp3"]},
  "audio/mp4": {"source":"iana","compressible":false,"extensions":["m4a","mp4a","m4b"]},
  "audio/mp4a-latm": {"source":"iana"},
  "audio/mpa": {"source":"iana"},
  "audio/mpa-robust": {"source":"iana"},
  "audio/mpeg": {"source":"iana","compressible":false,"extensions":["mpga","mp2","mp2a","mp3","m2a","m3a"]},
  "audio/mpeg4-generic": {"source":"iana"},
  "audio/musepack": {"source":"apache"},
  "audio/ogg": {"source":"iana","compressible":false,"extensions":["oga","ogg","spx","opus"]},
  "audio/opus": {"source":"iana"},
  "audio/parityfec": {"source":"iana"},
  "audio/pcma": {"source":"iana"},
  "audio/pcma-wb": {"source":"iana"},
  "audio/pcmu": {"source":"iana"},
  "audio/pcmu-wb": {"source":"iana"},
  "audio/prs.sid": {"source":"iana"},
  "audio/qcelp": {"source":"iana"},
  "audio/raptorfec": {"source":"iana"},
  "audio/red": {"source":"iana"},
  "audio/rtp-enc-aescm128": {"source":"iana"},
  "audio/rtp-midi": {"source":"iana"},
  "audio/rtploopback": {"source":"iana"},
  "audio/rtx": {"source":"iana"},
  "audio/s3m": {"source":"apache","extensions":["s3m"]},
  "audio/scip": {"source":"iana"},
  "audio/silk": {"source":"apache","extensions":["sil"]},
  "audio/smv": {"source":"iana"},
  "audio/smv-qcp": {"source":"iana"},
  "audio/smv0": {"source":"iana"},
  "audio/sofa": {"source":"iana"},
  "audio/sp-midi": {"source":"iana"},
  "audio/speex": {"source":"iana"},
  "audio/t140c": {"source":"iana"},
  "audio/t38": {"source":"iana"},
  "audio/telephone-event": {"source":"iana"},
  "audio/tetra_acelp": {"source":"iana"},
  "audio/tetra_acelp_bb": {"source":"iana"},
  "audio/tone": {"source":"iana"},
  "audio/tsvcis": {"source":"iana"},
  "audio/uemclip": {"source":"iana"},
  "audio/ulpfec": {"source":"iana"},
  "audio/usac": {"source":"iana"},
  "audio/vdvi": {"source":"iana"},
  "audio/vmr-wb": {"source":"iana"},
  "audio/vnd.3gpp.iufp": {"source":"iana"},
  "audio/vnd.4sb": {"source":"iana"},
  "audio/vnd.audiokoz": {"source":"iana"},
  "audio/vnd.celp": {"source":"iana"},
  "audio/vnd.cisco.nse": {"source":"iana"},
  "audio/vnd.cmles.radio-events": {"source":"iana"},
  "audio/vnd.cns.anp1": {"source":"iana"},
  "audio/vnd.cns.inf1": {"source":"iana"},
  "audio/vnd.dece.audio": {"source":"iana","extensions":["uva","uvva"]},
  "audio/vnd.digital-winds": {"source":"iana","extensions":["eol"]},
  "audio/vnd.dlna.adts": {"source":"iana"},
  "audio/vnd.dolby.heaac.1": {"source":"iana"},
  "audio/vnd.dolby.heaac.2": {"source":"iana"},
  "audio/vnd.dolby.mlp": {"source":"iana"},
  "audio/vnd.dolby.mps": {"source":"iana"},
  "audio/vnd.dolby.pl2": {"source":"iana"},
  "audio/vnd.dolby.pl2x": {"source":"iana"},
  "audio/vnd.dolby.pl2z": {"source":"iana"},
  "audio/vnd.dolby.pulse.1": {"source":"iana"},
  "audio/vnd.dra": {"source":"iana","extensions":["dra"]},
  "audio/vnd.dts": {"source":"iana","extensions":["dts"]},
  "audio/vnd.dts.hd": {"source":"iana","extensions":["dtshd"]},
  "audio/vnd.dts.uhd": {"source":"iana"},
  "audio/vnd.dvb.file": {"source":"iana"},
  "audio/vnd.everad.plj": {"source":"iana"},
  "audio/vnd.hns.audio": {"source":"iana"},
  "audio/vnd.lucent.voice": {"source":"iana","extensions":["lvp"]},
  "audio/vnd.ms-playready.media.pya": {"source":"iana","extensions":["pya"]},
  "audio/vnd.nokia.mobile-xmf": {"source":"iana"},
  "audio/vnd.nortel.vbk": {"source":"iana"},
  "audio/vnd.nuera.ecelp4800": {"source":"iana","extensions":["ecelp4800"]},
  "audio/vnd.nuera.ecelp7470": {"source":"iana","extensions":["ecelp7470"]},
  "audio/vnd.nuera.ecelp9600": {"source":"iana","extensions":["ecelp9600"]},
  "audio/vnd.octel.sbc": {"source":"iana"},
  "audio/vnd.presonus.multitrack": {"source":"iana"},
  "audio/vnd.qcelp": {"source":"apache"},
  "audio/vnd.rhetorex.32kadpcm": {"source":"iana"},
  "audio/vnd.rip": {"source":"iana","extensions":["rip"]},
  "audio/vnd.rn-realaudio": {"compressible":false},
  "audio/vnd.sealedmedia.softseal.mpeg": {"source":"iana"},
  "audio/vnd.vmx.cvsd": {"source":"iana"},
  "audio/vnd.wave": {"compressible":false},
  "audio/vorbis": {"source":"iana","compressible":false},
  "audio/vorbis-config": {"source":"iana"},
  "audio/wav": {"compressible":false,"extensions":["wav"]},
  "audio/wave": {"compressible":false,"extensions":["wav"]},
  "audio/webm": {"source":"apache","compressible":false,"extensions":["weba"]},
  "audio/x-aac": {"source":"apache","compressible":false,"extensions":["aac"]},
  "audio/x-aiff": {"source":"apache","extensions":["aif","aiff","aifc"]},
  "audio/x-caf": {"source":"apache","compressible":false,"extensions":["caf"]},
  "audio/x-flac": {"source":"apache","extensions":["flac"]},
  "audio/x-m4a": {"source":"nginx","extensions":["m4a"]},
  "audio/x-matroska": {"source":"apache","extensions":["mka"]},
  "audio/x-mpegurl": {"source":"apache","extensions":["m3u"]},
  "audio/x-ms-wax": {"source":"apache","extensions":["wax"]},
  "audio/x-ms-wma": {"source":"apache","extensions":["wma"]},
  "audio/x-pn-realaudio": {"source":"apache","extensions":["ram","ra"]},
  "audio/x-pn-realaudio-plugin": {"source":"apache","extensions":["rmp"]},
  "audio/x-realaudio": {"source":"nginx","extensions":["ra"]},
  "audio/x-tta": {"source":"apache"},
  "audio/x-wav": {"source":"apache","extensions":["wav"]},
  "audio/xm": {"source":"apache","extensions":["xm"]},
  "chemical/x-cdx": {"source":"apache","extensions":["cdx"]},
  "chemical/x-cif": {"source":"apache","extensions":["cif"]},
  "chemical/x-cmdf": {"source":"apache","extensions":["cmdf"]},
  "chemical/x-cml": {"source":"apache","extensions":["cml"]},
  "chemical/x-csml": {"source":"apache","extensions":["csml"]},
  "chemical/x-pdb": {"source":"apache"},
  "chemical/x-xyz": {"source":"apache","extensions":["xyz"]},
  "font/collection": {"source":"iana","extensions":["ttc"]},
  "font/otf": {"source":"iana","compressible":true,"extensions":["otf"]},
  "font/sfnt": {"source":"iana"},
  "font/ttf": {"source":"iana","compressible":true,"extensions":["ttf"]},
  "font/woff": {"source":"iana","extensions":["woff"]},
  "font/woff2": {"source":"iana","extensions":["woff2"]},
  "image/aces": {"source":"iana","extensions":["exr"]},
  "image/apng": {"source":"iana","compressible":false,"extensions":["apng"]},
  "image/avci": {"source":"iana","extensions":["avci"]},
  "image/avcs": {"source":"iana","extensions":["avcs"]},
  "image/avif": {"source":"iana","compressible":false,"extensions":["avif"]},
  "image/bmp": {"source":"iana","compressible":true,"extensions":["bmp","dib"]},
  "image/cgm": {"source":"iana","extensions":["cgm"]},
  "image/dicom-rle": {"source":"iana","extensions":["drle"]},
  "image/dpx": {"source":"iana","extensions":["dpx"]},
  "image/emf": {"source":"iana","extensions":["emf"]},
  "image/fits": {"source":"iana","extensions":["fits"]},
  "image/g3fax": {"source":"iana","extensions":["g3"]},
  "image/gif": {"source":"iana","compressible":false,"extensions":["gif"]},
  "image/heic": {"source":"iana","extensions":["heic"]},
  "image/heic-sequence": {"source":"iana","extensions":["heics"]},
  "image/heif": {"source":"iana","extensions":["heif"]},
  "image/heif-sequence": {"source":"iana","extensions":["heifs"]},
  "image/hej2k": {"source":"iana","extensions":["hej2"]},
  "image/ief": {"source":"iana","extensions":["ief"]},
  "image/j2c": {"source":"iana"},
  "image/jaii": {"source":"iana","extensions":["jaii"]},
  "image/jais": {"source":"iana","extensions":["jais"]},
  "image/jls": {"source":"iana","extensions":["jls"]},
  "image/jp2": {"source":"iana","compressible":false,"extensions":["jp2","jpg2"]},
  "image/jpeg": {"source":"iana","compressible":false,"extensions":["jpg","jpeg","jpe"]},
  "image/jph": {"source":"iana","extensions":["jph"]},
  "image/jphc": {"source":"iana","extensions":["jhc"]},
  "image/jpm": {"source":"iana","compressible":false,"extensions":["jpm","jpgm"]},
  "image/jpx": {"source":"iana","compressible":false,"extensions":["jpx","jpf"]},
  "image/jxl": {"source":"iana","extensions":["jxl"]},
  "image/jxr": {"source":"iana","extensions":["jxr"]},
  "image/jxra": {"source":"iana","extensions":["jxra"]},
  "image/jxrs": {"source":"iana","extensions":["jxrs"]},
  "image/jxs": {"source":"iana","extensions":["jxs"]},
  "image/jxsc": {"source":"iana","extensions":["jxsc"]},
  "image/jxsi": {"source":"iana","extensions":["jxsi"]},
  "image/jxss": {"source":"iana","extensions":["jxss"]},
  "image/ktx": {"source":"iana","extensions":["ktx"]},
  "image/ktx2": {"source":"iana","extensions":["ktx2"]},
  "image/naplps": {"source":"iana"},
  "image/pjpeg": {"compressible":false,"extensions":["jfif"]},
  "image/png": {"source":"iana","compressible":false,"extensions":["png"]},
  "image/prs.btif": {"source":"iana","extensions":["btif","btf"]},
  "image/prs.pti": {"source":"iana","extensions":["pti"]},
  "image/pwg-raster": {"source":"iana"},
  "image/sgi": {"source":"apache","extensions":["sgi"]},
  "image/svg+xml": {"source":"iana","compressible":true,"extensions":["svg","svgz"]},
  "image/t38": {"source":"iana","extensions":["t38"]},
  "image/tiff": {"source":"iana","compressible":false,"extensions":["tif","tiff"]},
  "image/tiff-fx": {"source":"iana","extensions":["tfx"]},
  "image/vnd.adobe.photoshop": {"source":"iana","compressible":true,"extensions":["psd"]},
  "image/vnd.airzip.accelerator.azv": {"source":"iana","extensions":["azv"]},
  "image/vnd.clip": {"source":"iana"},
  "image/vnd.cns.inf2": {"source":"iana"},
  "image/vnd.dece.graphic": {"source":"iana","extensions":["uvi","uvvi","uvg","uvvg"]},
  "image/vnd.djvu": {"source":"iana","extensions":["djvu","djv"]},
  "image/vnd.dvb.subtitle": {"source":"iana","extensions":["sub"]},
  "image/vnd.dwg": {"source":"iana","extensions":["dwg"]},
  "image/vnd.dxf": {"source":"iana","extensions":["dxf"]},
  "image/vnd.fastbidsheet": {"source":"iana","extensions":["fbs"]},
  "image/vnd.fpx": {"source":"iana","extensions":["fpx"]},
  "image/vnd.fst": {"source":"iana","extensions":["fst"]},
  "image/vnd.fujixerox.edmics-mmr": {"source":"iana","extensions":["mmr"]},
  "image/vnd.fujixerox.edmics-rlc": {"source":"iana","extensions":["rlc"]},
  "image/vnd.globalgraphics.pgb": {"source":"iana"},
  "image/vnd.microsoft.icon": {"source":"iana","compressible":true,"extensions":["ico"]},
  "image/vnd.mix": {"source":"iana"},
  "image/vnd.mozilla.apng": {"source":"iana"},
  "image/vnd.ms-dds": {"compressible":true,"extensions":["dds"]},
  "image/vnd.ms-modi": {"source":"iana","extensions":["mdi"]},
  "image/vnd.ms-photo": {"source":"apache","extensions":["wdp"]},
  "image/vnd.net-fpx": {"source":"iana","extensions":["npx"]},
  "image/vnd.pco.b16": {"source":"iana","extensions":["b16"]},
  "image/vnd.radiance": {"source":"iana"},
  "image/vnd.sealed.png": {"source":"iana"},
  "image/vnd.sealedmedia.softseal.gif": {"source":"iana"},
  "image/vnd.sealedmedia.softseal.jpg": {"source":"iana"},
  "image/vnd.svf": {"source":"iana"},
  "image/vnd.tencent.tap": {"source":"iana","extensions":["tap"]},
  "image/vnd.valve.source.texture": {"source":"iana","extensions":["vtf"]},
  "image/vnd.wap.wbmp": {"source":"iana","extensions":["wbmp"]},
  "image/vnd.xiff": {"source":"iana","extensions":["xif"]},
  "image/vnd.zbrush.pcx": {"source":"iana","extensions":["pcx"]},
  "image/webp": {"source":"iana","extensions":["webp"]},
  "image/wmf": {"source":"iana","extensions":["wmf"]},
  "image/x-3ds": {"source":"apache","extensions":["3ds"]},
  "image/x-adobe-dng": {"extensions":["dng"]},
  "image/x-cmu-raster": {"source":"apache","extensions":["ras"]},
  "image/x-cmx": {"source":"apache","extensions":["cmx"]},
  "image/x-emf": {"source":"iana"},
  "image/x-freehand": {"source":"apache","extensions":["fh","fhc","fh4","fh5","fh7"]},
  "image/x-icon": {"source":"apache","compressible":true,"extensions":["ico"]},
  "image/x-jng": {"source":"nginx","extensions":["jng"]},
  "image/x-mrsid-image": {"source":"apache","extensions":["sid"]},
  "image/x-ms-bmp": {"source":"nginx","compressible":true,"extensions":["bmp"]},
  "image/x-pcx": {"source":"apache","extensions":["pcx"]},
  "image/x-pict": {"source":"apache","extensions":["pic","pct"]},
  "image/x-portable-anymap": {"source":"apache","extensions":["pnm"]},
  "image/x-portable-bitmap": {"source":"apache","extensions":["pbm"]},
  "image/x-portable-graymap": {"source":"apache","extensions":["pgm"]},
  "image/x-portable-pixmap": {"source":"apache","extensions":["ppm"]},
  "image/x-rgb": {"source":"apache","extensions":["rgb"]},
  "image/x-tga": {"source":"apache","extensions":["tga"]},
  "image/x-wmf": {"source":"iana"},
  "image/x-xbitmap": {"source":"apache","extensions":["xbm"]},
  "image/x-xcf": {"compressible":false},
  "image/x-xpixmap": {"source":"apache","extensions":["xpm"]},
  "image/x-xwindowdump": {"source":"apache","extensions":["xwd"]},
  "message/bhttp": {"source":"iana"},
  "message/cpim": {"source":"iana"},
  "message/delivery-status": {"source":"iana"},
  "message/disposition-notification": {"source":"iana","extensions":["disposition-notification"]},
  "message/external-body": {"source":"iana"},
  "message/feedback-report": {"source":"iana"},
  "message/global": {"source":"iana","extensions":["u8msg"]},
  "message/global-delivery-status": {"source":"iana","extensions":["u8dsn"]},
  "message/global-disposition-notification": {"source":"iana","extensions":["u8mdn"]},
  "message/global-headers": {"source":"iana","extensions":["u8hdr"]},
  "message/http": {"source":"iana","compressible":false},
  "message/imdn+xml": {"source":"iana","compressible":true},
  "message/mls": {"source":"iana"},
  "message/news": {"source":"apache"},
  "message/ohttp-req": {"source":"iana"},
  "message/ohttp-res": {"source":"iana"},
  "message/partial": {"source":"iana","compressible":false},
  "message/rfc822": {"source":"iana","compressible":true,"extensions":["eml","mime","mht","mhtml"]},
  "message/s-http": {"source":"apache"},
  "message/sip": {"source":"iana"},
  "message/sipfrag": {"source":"iana"},
  "message/tracking-status": {"source":"iana"},
  "message/vnd.si.simp": {"source":"apache"},
  "message/vnd.wfa.wsc": {"source":"iana","extensions":["wsc"]},
  "model/3mf": {"source":"iana","extensions":["3mf"]},
  "model/e57": {"source":"iana"},
  "model/gltf+json": {"source":"iana","compressible":true,"extensions":["gltf"]},
  "model/gltf-binary": {"source":"iana","compressible":true,"extensions":["glb"]},
  "model/iges": {"source":"iana","compressible":false,"extensions":["igs","iges"]},
  "model/jt": {"source":"iana","extensions":["jt"]},
  "model/mesh": {"source":"iana","compressible":false,"extensions":["msh","mesh","silo"]},
  "model/mtl": {"source":"iana","extensions":["mtl"]},
  "model/obj": {"source":"iana","extensions":["obj"]},
  "model/prc": {"source":"iana","extensions":["prc"]},
  "model/step": {"source":"iana","extensions":["step","stp","stpnc","p21","210"]},
  "model/step+xml": {"source":"iana","compressible":true,"extensions":["stpx"]},
  "model/step+zip": {"source":"iana","compressible":false,"extensions":["stpz"]},
  "model/step-xml+zip": {"source":"iana","compressible":false,"extensions":["stpxz"]},
  "model/stl": {"source":"iana","extensions":["stl"]},
  "model/u3d": {"source":"iana","extensions":["u3d"]},
  "model/vnd.bary": {"source":"iana","extensions":["bary"]},
  "model/vnd.cld": {"source":"iana","extensions":["cld"]},
  "model/vnd.collada+xml": {"source":"iana","compressible":true,"extensions":["dae"]},
  "model/vnd.dwf": {"source":"iana","extensions":["dwf"]},
  "model/vnd.flatland.3dml": {"source":"iana"},
  "model/vnd.gdl": {"source":"iana","extensions":["gdl"]},
  "model/vnd.gs-gdl": {"source":"apache"},
  "model/vnd.gs.gdl": {"source":"iana"},
  "model/vnd.gtw": {"source":"iana","extensions":["gtw"]},
  "model/vnd.moml+xml": {"source":"iana","compressible":true},
  "model/vnd.mts": {"source":"iana","extensions":["mts"]},
  "model/vnd.opengex": {"source":"iana","extensions":["ogex"]},
  "model/vnd.parasolid.transmit.binary": {"source":"iana","extensions":["x_b"]},
  "model/vnd.parasolid.transmit.text": {"source":"iana","extensions":["x_t"]},
  "model/vnd.pytha.pyox": {"source":"iana","extensions":["pyo","pyox"]},
  "model/vnd.rosette.annotated-data-model": {"source":"iana"},
  "model/vnd.sap.vds": {"source":"iana","extensions":["vds"]},
  "model/vnd.usda": {"source":"iana","extensions":["usda"]},
  "model/vnd.usdz+zip": {"source":"iana","compressible":false,"extensions":["usdz"]},
  "model/vnd.valve.source.compiled-map": {"source":"iana","extensions":["bsp"]},
  "model/vnd.vtu": {"source":"iana","extensions":["vtu"]},
  "model/vrml": {"source":"iana","compressible":false,"extensions":["wrl","vrml"]},
  "model/x3d+binary": {"source":"apache","compressible":false,"extensions":["x3db","x3dbz"]},
  "model/x3d+fastinfoset": {"source":"iana","extensions":["x3db"]},
  "model/x3d+vrml": {"source":"apache","compressible":false,"extensions":["x3dv","x3dvz"]},
  "model/x3d+xml": {"source":"iana","compressible":true,"extensions":["x3d","x3dz"]},
  "model/x3d-vrml": {"source":"iana","extensions":["x3dv"]},
  "multipart/alternative": {"source":"iana","compressible":false},
  "multipart/appledouble": {"source":"iana"},
  "multipart/byteranges": {"source":"iana"},
  "multipart/digest": {"source":"iana"},
  "multipart/encrypted": {"source":"iana","compressible":false},
  "multipart/form-data": {"source":"iana","compressible":false},
  "multipart/header-set": {"source":"iana"},
  "multipart/mixed": {"source":"iana"},
  "multipart/multilingual": {"source":"iana"},
  "multipart/parallel": {"source":"iana"},
  "multipart/related": {"source":"iana","compressible":false},
  "multipart/report": {"source":"iana"},
  "multipart/signed": {"source":"iana","compressible":false},
  "multipart/vnd.bint.med-plus": {"source":"iana"},
  "multipart/voice-message": {"source":"iana"},
  "multipart/x-mixed-replace": {"source":"iana"},
  "text/1d-interleaved-parityfec": {"source":"iana"},
  "text/cache-manifest": {"source":"iana","compressible":true,"extensions":["appcache","manifest"]},
  "text/calendar": {"source":"iana","extensions":["ics","ifb"]},
  "text/calender": {"compressible":true},
  "text/cmd": {"compressible":true},
  "text/coffeescript": {"extensions":["coffee","litcoffee"]},
  "text/cql": {"source":"iana"},
  "text/cql-expression": {"source":"iana"},
  "text/cql-identifier": {"source":"iana"},
  "text/css": {"source":"iana","charset":"UTF-8","compressible":true,"extensions":["css"]},
  "text/csv": {"source":"iana","compressible":true,"extensions":["csv"]},
  "text/csv-schema": {"source":"iana"},
  "text/directory": {"source":"iana"},
  "text/dns": {"source":"iana"},
  "text/ecmascript": {"source":"apache"},
  "text/encaprtp": {"source":"iana"},
  "text/enriched": {"source":"iana"},
  "text/fhirpath": {"source":"iana"},
  "text/flexfec": {"source":"iana"},
  "text/fwdred": {"source":"iana"},
  "text/gff3": {"source":"iana"},
  "text/grammar-ref-list": {"source":"iana"},
  "text/hl7v2": {"source":"iana"},
  "text/html": {"source":"iana","compressible":true,"extensions":["html","htm","shtml"]},
  "text/jade": {"extensions":["jade"]},
  "text/javascript": {"source":"iana","charset":"UTF-8","compressible":true,"extensions":["js","mjs"]},
  "text/jcr-cnd": {"source":"iana"},
  "text/jsx": {"compressible":true,"extensions":["jsx"]},
  "text/less": {"compressible":true,"extensions":["less"]},
  "text/markdown": {"source":"iana","compressible":true,"extensions":["md","markdown"]},
  "text/mathml": {"source":"nginx","extensions":["mml"]},
  "text/mdx": {"compressible":true,"extensions":["mdx"]},
  "text/mizar": {"source":"iana"},
  "text/n3": {"source":"iana","charset":"UTF-8","compressible":true,"extensions":["n3"]},
  "text/parameters": {"source":"iana","charset":"UTF-8"},
  "text/parityfec": {"source":"iana"},
  "text/plain": {"source":"iana","compressible":true,"extensions":["txt","text","conf","def","list","log","in","ini"]},
  "text/provenance-notation": {"source":"iana","charset":"UTF-8"},
  "text/prs.fallenstein.rst": {"source":"iana"},
  "text/prs.lines.tag": {"source":"iana","extensions":["dsc"]},
  "text/prs.prop.logic": {"source":"iana"},
  "text/prs.texi": {"source":"iana"},
  "text/raptorfec": {"source":"iana"},
  "text/red": {"source":"iana"},
  "text/rfc822-headers": {"source":"iana"},
  "text/richtext": {"source":"iana","compressible":true,"extensions":["rtx"]},
  "text/rtf": {"source":"iana","compressible":true,"extensions":["rtf"]},
  "text/rtp-enc-aescm128": {"source":"iana"},
  "text/rtploopback": {"source":"iana"},
  "text/rtx": {"source":"iana"},
  "text/sgml": {"source":"iana","extensions":["sgml","sgm"]},
  "text/shaclc": {"source":"iana"},
  "text/shex": {"source":"iana","extensions":["shex"]},
  "text/slim": {"extensions":["slim","slm"]},
  "text/spdx": {"source":"iana","extensions":["spdx"]},
  "text/strings": {"source":"iana"},
  "text/stylus": {"extensions":["stylus","styl"]},
  "text/t140": {"source":"iana"},
  "text/tab-separated-values": {"source":"iana","compressible":true,"extensions":["tsv"]},
  "text/troff": {"source":"iana","extensions":["t","tr","roff","man","me","ms"]},
  "text/turtle": {"source":"iana","charset":"UTF-8","extensions":["ttl"]},
  "text/ulpfec": {"source":"iana"},
  "text/uri-list": {"source":"iana","compressible":true,"extensions":["uri","uris","urls"]},
  "text/vcard": {"source":"iana","compressible":true,"extensions":["vcard"]},
  "text/vnd.a": {"source":"iana"},
  "text/vnd.abc": {"source":"iana"},
  "text/vnd.ascii-art": {"source":"iana"},
  "text/vnd.curl": {"source":"iana","extensions":["curl"]},
  "text/vnd.curl.dcurl": {"source":"apache","extensions":["dcurl"]},
  "text/vnd.curl.mcurl": {"source":"apache","extensions":["mcurl"]},
  "text/vnd.curl.scurl": {"source":"apache","extensions":["scurl"]},
  "text/vnd.debian.copyright": {"source":"iana","charset":"UTF-8"},
  "text/vnd.dmclientscript": {"source":"iana"},
  "text/vnd.dvb.subtitle": {"source":"iana","extensions":["sub"]},
  "text/vnd.esmertec.theme-descriptor": {"source":"iana","charset":"UTF-8"},
  "text/vnd.exchangeable": {"source":"iana"},
  "text/vnd.familysearch.gedcom": {"source":"iana","extensions":["ged"]},
  "text/vnd.ficlab.flt": {"source":"iana"},
  "text/vnd.fly": {"source":"iana","extensions":["fly"]},
  "text/vnd.fmi.flexstor": {"source":"iana","extensions":["flx"]},
  "text/vnd.gml": {"source":"iana"},
  "text/vnd.graphviz": {"source":"iana","extensions":["gv"]},
  "text/vnd.hans": {"source":"iana"},
  "text/vnd.hgl": {"source":"iana"},
  "text/vnd.in3d.3dml": {"source":"iana","extensions":["3dml"]},
  "text/vnd.in3d.spot": {"source":"iana","extensions":["spot"]},
  "text/vnd.iptc.newsml": {"source":"iana"},
  "text/vnd.iptc.nitf": {"source":"iana"},
  "text/vnd.latex-z": {"source":"iana"},
  "text/vnd.motorola.reflex": {"source":"iana"},
  "text/vnd.ms-mediapackage": {"source":"iana"},
  "text/vnd.net2phone.commcenter.command": {"source":"iana"},
  "text/vnd.radisys.msml-basic-layout": {"source":"iana"},
  "text/vnd.senx.warpscript": {"source":"iana"},
  "text/vnd.si.uricatalogue": {"source":"apache"},
  "text/vnd.sosi": {"source":"iana"},
  "text/vnd.sun.j2me.app-descriptor": {"source":"iana","charset":"UTF-8","extensions":["jad"]},
  "text/vnd.trolltech.linguist": {"source":"iana","charset":"UTF-8"},
  "text/vnd.vcf": {"source":"iana"},
  "text/vnd.wap.si": {"source":"iana"},
  "text/vnd.wap.sl": {"source":"iana"},
  "text/vnd.wap.wml": {"source":"iana","extensions":["wml"]},
  "text/vnd.wap.wmlscript": {"source":"iana","extensions":["wmls"]},
  "text/vnd.zoo.kcl": {"source":"iana"},
  "text/vtt": {"source":"iana","charset":"UTF-8","compressible":true,"extensions":["vtt"]},
  "text/wgsl": {"source":"iana","extensions":["wgsl"]},
  "text/x-asm": {"source":"apache","extensions":["s","asm"]},
  "text/x-c": {"source":"apache","extensions":["c","cc","cxx","cpp","h","hh","dic"]},
  "text/x-component": {"source":"nginx","extensions":["htc"]},
  "text/x-fortran": {"source":"apache","extensions":["f","for","f77","f90"]},
  "text/x-gwt-rpc": {"compressible":true},
  "text/x-handlebars-template": {"extensions":["hbs"]},
  "text/x-java-source": {"source":"apache","extensions":["java"]},
  "text/x-jquery-tmpl": {"compressible":true},
  "text/x-lua": {"extensions":["lua"]},
  "text/x-markdown": {"compressible":true,"extensions":["mkd"]},
  "text/x-nfo": {"source":"apache","extensions":["nfo"]},
  "text/x-opml": {"source":"apache","extensions":["opml"]},
  "text/x-org": {"compressible":true,"extensions":["org"]},
  "text/x-pascal": {"source":"apache","extensions":["p","pas"]},
  "text/x-processing": {"compressible":true,"extensions":["pde"]},
  "text/x-sass": {"extensions":["sass"]},
  "text/x-scss": {"extensions":["scss"]},
  "text/x-setext": {"source":"apache","extensions":["etx"]},
  "text/x-sfv": {"source":"apache","extensions":["sfv"]},
  "text/x-suse-ymp": {"compressible":true,"extensions":["ymp"]},
  "text/x-uuencode": {"source":"apache","extensions":["uu"]},
  "text/x-vcalendar": {"source":"apache","extensions":["vcs"]},
  "text/x-vcard": {"source":"apache","extensions":["vcf"]},
  "text/xml": {"source":"iana","compressible":true,"extensions":["xml"]},
  "text/xml-external-parsed-entity": {"source":"iana"},
  "text/yaml": {"compressible":true,"extensions":["yaml","yml"]},
  "video/1d-interleaved-parityfec": {"source":"iana"},
  "video/3gpp": {"source":"iana","extensions":["3gp","3gpp"]},
  "video/3gpp-tt": {"source":"iana"},
  "video/3gpp2": {"source":"iana","extensions":["3g2"]},
  "video/av1": {"source":"iana"},
  "video/bmpeg": {"source":"iana"},
  "video/bt656": {"source":"iana"},
  "video/celb": {"source":"iana"},
  "video/dv": {"source":"iana"},
  "video/encaprtp": {"source":"iana"},
  "video/evc": {"source":"iana"},
  "video/ffv1": {"source":"iana"},
  "video/flexfec": {"source":"iana"},
  "video/h261": {"source":"iana","extensions":["h261"]},
  "video/h263": {"source":"iana","extensions":["h263"]},
  "video/h263-1998": {"source":"iana"},
  "video/h263-2000": {"source":"iana"},
  "video/h264": {"source":"iana","extensions":["h264"]},
  "video/h264-rcdo": {"source":"iana"},
  "video/h264-svc": {"source":"iana"},
  "video/h265": {"source":"iana"},
  "video/h266": {"source":"iana"},
  "video/iso.segment": {"source":"iana","extensions":["m4s"]},
  "video/jpeg": {"source":"iana","extensions":["jpgv"]},
  "video/jpeg2000": {"source":"iana"},
  "video/jpm": {"source":"apache","extensions":["jpm","jpgm"]},
  "video/jxsv": {"source":"iana"},
  "video/lottie+json": {"source":"iana","compressible":true},
  "video/matroska": {"source":"iana"},
  "video/matroska-3d": {"source":"iana"},
  "video/mj2": {"source":"iana","extensions":["mj2","mjp2"]},
  "video/mp1s": {"source":"iana"},
  "video/mp2p": {"source":"iana"},
  "video/mp2t": {"source":"iana","extensions":["ts","m2t","m2ts","mts"]},
  "video/mp4": {"source":"iana","compressible":false,"extensions":["mp4","mp4v","mpg4"]},
  "video/mp4v-es": {"source":"iana"},
  "video/mpeg": {"source":"iana","compressible":false,"extensions":["mpeg","mpg","mpe","m1v","m2v"]},
  "video/mpeg4-generic": {"source":"iana"},
  "video/mpv": {"source":"iana"},
  "video/nv": {"source":"iana"},
  "video/ogg": {"source":"iana","compressible":false,"extensions":["ogv"]},
  "video/parityfec": {"source":"iana"},
  "video/pointer": {"source":"iana"},
  "video/quicktime": {"source":"iana","compressible":false,"extensions":["qt","mov"]},
  "video/raptorfec": {"source":"iana"},
  "video/raw": {"source":"iana"},
  "video/rtp-enc-aescm128": {"source":"iana"},
  "video/rtploopback": {"source":"iana"},
  "video/rtx": {"source":"iana"},
  "video/scip": {"source":"iana"},
  "video/smpte291": {"source":"iana"},
  "video/smpte292m": {"source":"iana"},
  "video/ulpfec": {"source":"iana"},
  "video/vc1": {"source":"iana"},
  "video/vc2": {"source":"iana"},
  "video/vnd.cctv": {"source":"iana"},
  "video/vnd.dece.hd": {"source":"iana","extensions":["uvh","uvvh"]},
  "video/vnd.dece.mobile": {"source":"iana","extensions":["uvm","uvvm"]},
  "video/vnd.dece.mp4": {"source":"iana"},
  "video/vnd.dece.pd": {"source":"iana","extensions":["uvp","uvvp"]},
  "video/vnd.dece.sd": {"source":"iana","extensions":["uvs","uvvs"]},
  "video/vnd.dece.video": {"source":"iana","extensions":["uvv","uvvv"]},
  "video/vnd.directv.mpeg": {"source":"iana"},
  "video/vnd.directv.mpeg-tts": {"source":"iana"},
  "video/vnd.dlna.mpeg-tts": {"source":"iana"},
  "video/vnd.dvb.file": {"source":"iana","extensions":["dvb"]},
  "video/vnd.fvt": {"source":"iana","extensions":["fvt"]},
  "video/vnd.hns.video": {"source":"iana"},
  "video/vnd.iptvforum.1dparityfec-1010": {"source":"iana"},
  "video/vnd.iptvforum.1dparityfec-2005": {"source":"iana"},
  "video/vnd.iptvforum.2dparityfec-1010": {"source":"iana"},
  "video/vnd.iptvforum.2dparityfec-2005": {"source":"iana"},
  "video/vnd.iptvforum.ttsavc": {"source":"iana"},
  "video/vnd.iptvforum.ttsmpeg2": {"source":"iana"},
  "video/vnd.motorola.video": {"source":"iana"},
  "video/vnd.motorola.videop": {"source":"iana"},
  "video/vnd.mpegurl": {"source":"iana","extensions":["mxu","m4u"]},
  "video/vnd.ms-playready.media.pyv": {"source":"iana","extensions":["pyv"]},
  "video/vnd.nokia.interleaved-multimedia": {"source":"iana"},
  "video/vnd.nokia.mp4vr": {"source":"iana"},
  "video/vnd.nokia.videovoip": {"source":"iana"},
  "video/vnd.objectvideo": {"source":"iana"},
  "video/vnd.planar": {"source":"iana"},
  "video/vnd.radgamettools.bink": {"source":"iana"},
  "video/vnd.radgamettools.smacker": {"source":"apache"},
  "video/vnd.sealed.mpeg1": {"source":"iana"},
  "video/vnd.sealed.mpeg4": {"source":"iana"},
  "video/vnd.sealed.swf": {"source":"iana"},
  "video/vnd.sealedmedia.softseal.mov": {"source":"iana"},
  "video/vnd.uvvu.mp4": {"source":"iana","extensions":["uvu","uvvu"]},
  "video/vnd.vivo": {"source":"iana","extensions":["viv"]},
  "video/vnd.youtube.yt": {"source":"iana"},
  "video/vp8": {"source":"iana"},
  "video/vp9": {"source":"iana"},
  "video/webm": {"source":"apache","compressible":false,"extensions":["webm"]},
  "video/x-f4v": {"source":"apache","extensions":["f4v"]},
  "video/x-fli": {"source":"apache","extensions":["fli"]},
  "video/x-flv": {"source":"apache","compressible":false,"extensions":["flv"]},
  "video/x-m4v": {"source":"apache","extensions":["m4v"]},
  "video/x-matroska": {"source":"apache","compressible":false,"extensions":["mkv","mk3d","mks"]},
  "video/x-mng": {"source":"apache","extensions":["mng"]},
  "video/x-ms-asf": {"source":"apache","extensions":["asf","asx"]},
  "video/x-ms-vob": {"source":"apache","extensions":["vob"]},
  "video/x-ms-wm": {"source":"apache","extensions":["wm"]},
  "video/x-ms-wmv": {"source":"apache","compressible":false,"extensions":["wmv"]},
  "video/x-ms-wmx": {"source":"apache","extensions":["wmx"]},
  "video/x-ms-wvx": {"source":"apache","extensions":["wvx"]},
  "video/x-msvideo": {"source":"apache","extensions":["avi"]},
  "video/x-sgi-movie": {"source":"apache","extensions":["movie"]},
  "video/x-smv": {"source":"apache","extensions":["smv"]},
  "x-conference/x-cooltalk": {"source":"apache","extensions":["ice"]},
  "x-shader/x-fragment": {"compressible":true},
  "x-shader/x-vertex": {"compressible":true},
};

/*!
 * mime-db
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015-2022 Douglas Christopher Wilson
 * MIT Licensed
 */

var mimeDb;
var hasRequiredMimeDb;

function requireMimeDb () {
	if (hasRequiredMimeDb) return mimeDb;
	hasRequiredMimeDb = 1;
	/**
	 * Module exports.
	 */

	mimeDb = require$$0$5;
	return mimeDb;
}

/*!
 * compressible
 * Copyright(c) 2013 Jonathan Ong
 * Copyright(c) 2014 Jeremiah Senkpiel
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */

var compressible_1;
var hasRequiredCompressible;

function requireCompressible () {
	if (hasRequiredCompressible) return compressible_1;
	hasRequiredCompressible = 1;

	/**
	 * Module dependencies.
	 * @private
	 */

	var db = requireMimeDb();

	/**
	 * Module variables.
	 * @private
	 */

	var COMPRESSIBLE_TYPE_REGEXP = /^text\/|\+(?:json|text|xml)$/i;
	var EXTRACT_TYPE_REGEXP = /^\s*([^;\s]*)(?:;|\s|$)/;

	/**
	 * Module exports.
	 * @public
	 */

	compressible_1 = compressible;

	/**
	 * Checks if a type is compressible.
	 *
	 * @param {string} type
	 * @return {Boolean} compressible
	 * @public
	 */

	function compressible (type) {
	  if (!type || typeof type !== 'string') {
	    return false
	  }

	  // strip parameters
	  var match = EXTRACT_TYPE_REGEXP.exec(type);
	  var mime = match && match[1].toLowerCase();
	  var data = db[mime];

	  // return database information
	  if (data && data.compressible !== undefined) {
	    return data.compressible
	  }

	  // fallback to regexp or unknown
	  return COMPRESSIBLE_TYPE_REGEXP.test(mime) || undefined
	}
	return compressible_1;
}

var src = {exports: {}};

var browser = {exports: {}};

var debug = {exports: {}};

/**
 * Helpers.
 */

var ms$1;
var hasRequiredMs$1;

function requireMs$1 () {
	if (hasRequiredMs$1) return ms$1;
	hasRequiredMs$1 = 1;
	var s = 1000;
	var m = s * 60;
	var h = m * 60;
	var d = h * 24;
	var y = d * 365.25;

	/**
	 * Parse or format the given `val`.
	 *
	 * Options:
	 *
	 *  - `long` verbose formatting [false]
	 *
	 * @param {String|Number} val
	 * @param {Object} [options]
	 * @throws {Error} throw an error if val is not a non-empty string or a number
	 * @return {String|Number}
	 * @api public
	 */

	ms$1 = function(val, options) {
	  options = options || {};
	  var type = typeof val;
	  if (type === 'string' && val.length > 0) {
	    return parse(val);
	  } else if (type === 'number' && isNaN(val) === false) {
	    return options.long ? fmtLong(val) : fmtShort(val);
	  }
	  throw new Error(
	    'val is not a non-empty string or a valid number. val=' +
	      JSON.stringify(val)
	  );
	};

	/**
	 * Parse the given `str` and return milliseconds.
	 *
	 * @param {String} str
	 * @return {Number}
	 * @api private
	 */

	function parse(str) {
	  str = String(str);
	  if (str.length > 100) {
	    return;
	  }
	  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(
	    str
	  );
	  if (!match) {
	    return;
	  }
	  var n = parseFloat(match[1]);
	  var type = (match[2] || 'ms').toLowerCase();
	  switch (type) {
	    case 'years':
	    case 'year':
	    case 'yrs':
	    case 'yr':
	    case 'y':
	      return n * y;
	    case 'days':
	    case 'day':
	    case 'd':
	      return n * d;
	    case 'hours':
	    case 'hour':
	    case 'hrs':
	    case 'hr':
	    case 'h':
	      return n * h;
	    case 'minutes':
	    case 'minute':
	    case 'mins':
	    case 'min':
	    case 'm':
	      return n * m;
	    case 'seconds':
	    case 'second':
	    case 'secs':
	    case 'sec':
	    case 's':
	      return n * s;
	    case 'milliseconds':
	    case 'millisecond':
	    case 'msecs':
	    case 'msec':
	    case 'ms':
	      return n;
	    default:
	      return undefined;
	  }
	}

	/**
	 * Short format for `ms`.
	 *
	 * @param {Number} ms
	 * @return {String}
	 * @api private
	 */

	function fmtShort(ms) {
	  if (ms >= d) {
	    return Math.round(ms / d) + 'd';
	  }
	  if (ms >= h) {
	    return Math.round(ms / h) + 'h';
	  }
	  if (ms >= m) {
	    return Math.round(ms / m) + 'm';
	  }
	  if (ms >= s) {
	    return Math.round(ms / s) + 's';
	  }
	  return ms + 'ms';
	}

	/**
	 * Long format for `ms`.
	 *
	 * @param {Number} ms
	 * @return {String}
	 * @api private
	 */

	function fmtLong(ms) {
	  return plural(ms, d, 'day') ||
	    plural(ms, h, 'hour') ||
	    plural(ms, m, 'minute') ||
	    plural(ms, s, 'second') ||
	    ms + ' ms';
	}

	/**
	 * Pluralization helper.
	 */

	function plural(ms, n, name) {
	  if (ms < n) {
	    return;
	  }
	  if (ms < n * 1.5) {
	    return Math.floor(ms / n) + ' ' + name;
	  }
	  return Math.ceil(ms / n) + ' ' + name + 's';
	}
	return ms$1;
}

var hasRequiredDebug;

function requireDebug () {
	if (hasRequiredDebug) return debug.exports;
	hasRequiredDebug = 1;
	(function (module, exports) {
		/**
		 * This is the common logic for both the Node.js and web browser
		 * implementations of `debug()`.
		 *
		 * Expose `debug()` as the module.
		 */

		exports = module.exports = createDebug.debug = createDebug['default'] = createDebug;
		exports.coerce = coerce;
		exports.disable = disable;
		exports.enable = enable;
		exports.enabled = enabled;
		exports.humanize = requireMs$1();

		/**
		 * The currently active debug mode names, and names to skip.
		 */

		exports.names = [];
		exports.skips = [];

		/**
		 * Map of special "%n" handling functions, for the debug "format" argument.
		 *
		 * Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
		 */

		exports.formatters = {};

		/**
		 * Previous log timestamp.
		 */

		var prevTime;

		/**
		 * Select a color.
		 * @param {String} namespace
		 * @return {Number}
		 * @api private
		 */

		function selectColor(namespace) {
		  var hash = 0, i;

		  for (i in namespace) {
		    hash  = ((hash << 5) - hash) + namespace.charCodeAt(i);
		    hash |= 0; // Convert to 32bit integer
		  }

		  return exports.colors[Math.abs(hash) % exports.colors.length];
		}

		/**
		 * Create a debugger with the given `namespace`.
		 *
		 * @param {String} namespace
		 * @return {Function}
		 * @api public
		 */

		function createDebug(namespace) {

		  function debug() {
		    // disabled?
		    if (!debug.enabled) return;

		    var self = debug;

		    // set `diff` timestamp
		    var curr = +new Date();
		    var ms = curr - (prevTime || curr);
		    self.diff = ms;
		    self.prev = prevTime;
		    self.curr = curr;
		    prevTime = curr;

		    // turn the `arguments` into a proper Array
		    var args = new Array(arguments.length);
		    for (var i = 0; i < args.length; i++) {
		      args[i] = arguments[i];
		    }

		    args[0] = exports.coerce(args[0]);

		    if ('string' !== typeof args[0]) {
		      // anything else let's inspect with %O
		      args.unshift('%O');
		    }

		    // apply any `formatters` transformations
		    var index = 0;
		    args[0] = args[0].replace(/%([a-zA-Z%])/g, function(match, format) {
		      // if we encounter an escaped % then don't increase the array index
		      if (match === '%%') return match;
		      index++;
		      var formatter = exports.formatters[format];
		      if ('function' === typeof formatter) {
		        var val = args[index];
		        match = formatter.call(self, val);

		        // now we need to remove `args[index]` since it's inlined in the `format`
		        args.splice(index, 1);
		        index--;
		      }
		      return match;
		    });

		    // apply env-specific formatting (colors, etc.)
		    exports.formatArgs.call(self, args);

		    var logFn = debug.log || exports.log || console.log.bind(console);
		    logFn.apply(self, args);
		  }

		  debug.namespace = namespace;
		  debug.enabled = exports.enabled(namespace);
		  debug.useColors = exports.useColors();
		  debug.color = selectColor(namespace);

		  // env-specific initialization logic for debug instances
		  if ('function' === typeof exports.init) {
		    exports.init(debug);
		  }

		  return debug;
		}

		/**
		 * Enables a debug mode by namespaces. This can include modes
		 * separated by a colon and wildcards.
		 *
		 * @param {String} namespaces
		 * @api public
		 */

		function enable(namespaces) {
		  exports.save(namespaces);

		  exports.names = [];
		  exports.skips = [];

		  var split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
		  var len = split.length;

		  for (var i = 0; i < len; i++) {
		    if (!split[i]) continue; // ignore empty strings
		    namespaces = split[i].replace(/\*/g, '.*?');
		    if (namespaces[0] === '-') {
		      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
		    } else {
		      exports.names.push(new RegExp('^' + namespaces + '$'));
		    }
		  }
		}

		/**
		 * Disable debug output.
		 *
		 * @api public
		 */

		function disable() {
		  exports.enable('');
		}

		/**
		 * Returns true if the given mode name is enabled, false otherwise.
		 *
		 * @param {String} name
		 * @return {Boolean}
		 * @api public
		 */

		function enabled(name) {
		  var i, len;
		  for (i = 0, len = exports.skips.length; i < len; i++) {
		    if (exports.skips[i].test(name)) {
		      return false;
		    }
		  }
		  for (i = 0, len = exports.names.length; i < len; i++) {
		    if (exports.names[i].test(name)) {
		      return true;
		    }
		  }
		  return false;
		}

		/**
		 * Coerce `val`.
		 *
		 * @param {Mixed} val
		 * @return {Mixed}
		 * @api private
		 */

		function coerce(val) {
		  if (val instanceof Error) return val.stack || val.message;
		  return val;
		} 
	} (debug, debug.exports));
	return debug.exports;
}

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

var hasRequiredBrowser;

function requireBrowser () {
	if (hasRequiredBrowser) return browser.exports;
	hasRequiredBrowser = 1;
	(function (module, exports) {
		exports = module.exports = requireDebug();
		exports.log = log;
		exports.formatArgs = formatArgs;
		exports.save = save;
		exports.load = load;
		exports.useColors = useColors;
		exports.storage = 'undefined' != typeof chrome
		               && 'undefined' != typeof chrome.storage
		                  ? chrome.storage.local
		                  : localstorage();

		/**
		 * Colors.
		 */

		exports.colors = [
		  'lightseagreen',
		  'forestgreen',
		  'goldenrod',
		  'dodgerblue',
		  'darkorchid',
		  'crimson'
		];

		/**
		 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
		 * and the Firebug extension (any Firefox version) are known
		 * to support "%c" CSS customizations.
		 *
		 * TODO: add a `localStorage` variable to explicitly enable/disable colors
		 */

		function useColors() {
		  // NB: In an Electron preload script, document will be defined but not fully
		  // initialized. Since we know we're in Chrome, we'll just detect this case
		  // explicitly
		  if (typeof window !== 'undefined' && window.process && window.process.type === 'renderer') {
		    return true;
		  }

		  // is webkit? http://stackoverflow.com/a/16459606/376773
		  // document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
		  return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
		    // is firebug? http://stackoverflow.com/a/398120/376773
		    (typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
		    // is firefox >= v31?
		    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
		    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
		    // double check webkit in userAgent just in case we are in a worker
		    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
		}

		/**
		 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
		 */

		exports.formatters.j = function(v) {
		  try {
		    return JSON.stringify(v);
		  } catch (err) {
		    return '[UnexpectedJSONParseError]: ' + err.message;
		  }
		};


		/**
		 * Colorize log arguments if enabled.
		 *
		 * @api public
		 */

		function formatArgs(args) {
		  var useColors = this.useColors;

		  args[0] = (useColors ? '%c' : '')
		    + this.namespace
		    + (useColors ? ' %c' : ' ')
		    + args[0]
		    + (useColors ? '%c ' : ' ')
		    + '+' + exports.humanize(this.diff);

		  if (!useColors) return;

		  var c = 'color: ' + this.color;
		  args.splice(1, 0, c, 'color: inherit');

		  // the final "%c" is somewhat tricky, because there could be other
		  // arguments passed either before or after the %c, so we need to
		  // figure out the correct index to insert the CSS into
		  var index = 0;
		  var lastC = 0;
		  args[0].replace(/%[a-zA-Z%]/g, function(match) {
		    if ('%%' === match) return;
		    index++;
		    if ('%c' === match) {
		      // we only are interested in the *last* %c
		      // (the user may have provided their own)
		      lastC = index;
		    }
		  });

		  args.splice(lastC, 0, c);
		}

		/**
		 * Invokes `console.log()` when available.
		 * No-op when `console.log` is not a "function".
		 *
		 * @api public
		 */

		function log() {
		  // this hackery is required for IE8/9, where
		  // the `console.log` function doesn't have 'apply'
		  return 'object' === typeof console
		    && console.log
		    && Function.prototype.apply.call(console.log, console, arguments);
		}

		/**
		 * Save `namespaces`.
		 *
		 * @param {String} namespaces
		 * @api private
		 */

		function save(namespaces) {
		  try {
		    if (null == namespaces) {
		      exports.storage.removeItem('debug');
		    } else {
		      exports.storage.debug = namespaces;
		    }
		  } catch(e) {}
		}

		/**
		 * Load `namespaces`.
		 *
		 * @return {String} returns the previously persisted debug modes
		 * @api private
		 */

		function load() {
		  var r;
		  try {
		    r = exports.storage.debug;
		  } catch(e) {}

		  // If debug isn't set in LS, and we're in Electron, try to load $DEBUG
		  if (!r && typeof process !== 'undefined' && 'env' in process) {
		    r = process.env.DEBUG;
		  }

		  return r;
		}

		/**
		 * Enable namespaces listed in `localStorage.debug` initially.
		 */

		exports.enable(load());

		/**
		 * Localstorage attempts to return the localstorage.
		 *
		 * This is necessary because safari throws
		 * when a user disables cookies/localstorage
		 * and you attempt to access it.
		 *
		 * @return {LocalStorage}
		 * @api private
		 */

		function localstorage() {
		  try {
		    return window.localStorage;
		  } catch (e) {}
		} 
	} (browser, browser.exports));
	return browser.exports;
}

var node = {exports: {}};

const require$$0$4 = /*@__PURE__*/getAugmentedNamespace(tty);

const require$$16 = /*@__PURE__*/getAugmentedNamespace(util);

const require$$8 = /*@__PURE__*/getAugmentedNamespace(fs);

const require$$4 = /*@__PURE__*/getAugmentedNamespace(net);

/**
 * Module dependencies.
 */

var hasRequiredNode;

function requireNode () {
	if (hasRequiredNode) return node.exports;
	hasRequiredNode = 1;
	(function (module, exports) {
		var tty = require$$0$4;
		var util = require$$16;

		/**
		 * This is the Node.js implementation of `debug()`.
		 *
		 * Expose `debug()` as the module.
		 */

		exports = module.exports = requireDebug();
		exports.init = init;
		exports.log = log;
		exports.formatArgs = formatArgs;
		exports.save = save;
		exports.load = load;
		exports.useColors = useColors;

		/**
		 * Colors.
		 */

		exports.colors = [6, 2, 3, 4, 5, 1];

		/**
		 * Build up the default `inspectOpts` object from the environment variables.
		 *
		 *   $ DEBUG_COLORS=no DEBUG_DEPTH=10 DEBUG_SHOW_HIDDEN=enabled node script.js
		 */

		exports.inspectOpts = Object.keys(process.env).filter(function (key) {
		  return /^debug_/i.test(key);
		}).reduce(function (obj, key) {
		  // camel-case
		  var prop = key
		    .substring(6)
		    .toLowerCase()
		    .replace(/_([a-z])/g, function (_, k) { return k.toUpperCase() });

		  // coerce string value into JS value
		  var val = process.env[key];
		  if (/^(yes|on|true|enabled)$/i.test(val)) val = true;
		  else if (/^(no|off|false|disabled)$/i.test(val)) val = false;
		  else if (val === 'null') val = null;
		  else val = Number(val);

		  obj[prop] = val;
		  return obj;
		}, {});

		/**
		 * The file descriptor to write the `debug()` calls to.
		 * Set the `DEBUG_FD` env variable to override with another value. i.e.:
		 *
		 *   $ DEBUG_FD=3 node script.js 3>debug.log
		 */

		var fd = parseInt(process.env.DEBUG_FD, 10) || 2;

		if (1 !== fd && 2 !== fd) {
		  util.deprecate(function(){}, 'except for stderr(2) and stdout(1), any other usage of DEBUG_FD is deprecated. Override debug.log if you want to use a different log function (https://git.io/debug_fd)')();
		}

		var stream = 1 === fd ? process.stdout :
		             2 === fd ? process.stderr :
		             createWritableStdioStream(fd);

		/**
		 * Is stdout a TTY? Colored output is enabled when `true`.
		 */

		function useColors() {
		  return 'colors' in exports.inspectOpts
		    ? Boolean(exports.inspectOpts.colors)
		    : tty.isatty(fd);
		}

		/**
		 * Map %o to `util.inspect()`, all on a single line.
		 */

		exports.formatters.o = function(v) {
		  this.inspectOpts.colors = this.useColors;
		  return util.inspect(v, this.inspectOpts)
		    .split('\n').map(function(str) {
		      return str.trim()
		    }).join(' ');
		};

		/**
		 * Map %o to `util.inspect()`, allowing multiple lines if needed.
		 */

		exports.formatters.O = function(v) {
		  this.inspectOpts.colors = this.useColors;
		  return util.inspect(v, this.inspectOpts);
		};

		/**
		 * Adds ANSI color escape codes if enabled.
		 *
		 * @api public
		 */

		function formatArgs(args) {
		  var name = this.namespace;
		  var useColors = this.useColors;

		  if (useColors) {
		    var c = this.color;
		    var prefix = '  \u001b[3' + c + ';1m' + name + ' ' + '\u001b[0m';

		    args[0] = prefix + args[0].split('\n').join('\n' + prefix);
		    args.push('\u001b[3' + c + 'm+' + exports.humanize(this.diff) + '\u001b[0m');
		  } else {
		    args[0] = new Date().toUTCString()
		      + ' ' + name + ' ' + args[0];
		  }
		}

		/**
		 * Invokes `util.format()` with the specified arguments and writes to `stream`.
		 */

		function log() {
		  return stream.write(util.format.apply(util, arguments) + '\n');
		}

		/**
		 * Save `namespaces`.
		 *
		 * @param {String} namespaces
		 * @api private
		 */

		function save(namespaces) {
		  if (null == namespaces) {
		    // If you set a process.env field to null or undefined, it gets cast to the
		    // string 'null' or 'undefined'. Just delete instead.
		    delete process.env.DEBUG;
		  } else {
		    process.env.DEBUG = namespaces;
		  }
		}

		/**
		 * Load `namespaces`.
		 *
		 * @return {String} returns the previously persisted debug modes
		 * @api private
		 */

		function load() {
		  return process.env.DEBUG;
		}

		/**
		 * Copied from `node/src/node.js`.
		 *
		 * XXX: It's lame that node doesn't expose this API out-of-the-box. It also
		 * relies on the undocumented `tty_wrap.guessHandleType()` which is also lame.
		 */

		function createWritableStdioStream (fd) {
		  var stream;
		  var tty_wrap = process.binding('tty_wrap');

		  // Note stream._type is used for test-module-load-list.js

		  switch (tty_wrap.guessHandleType(fd)) {
		    case 'TTY':
		      stream = new tty.WriteStream(fd);
		      stream._type = 'tty';

		      // Hack to have stream not keep the event loop alive.
		      // See https://github.com/joyent/node/issues/1726
		      if (stream._handle && stream._handle.unref) {
		        stream._handle.unref();
		      }
		      break;

		    case 'FILE':
		      var fs = require$$8;
		      stream = new fs.SyncWriteStream(fd, { autoClose: false });
		      stream._type = 'fs';
		      break;

		    case 'PIPE':
		    case 'TCP':
		      var net = require$$4;
		      stream = new net.Socket({
		        fd: fd,
		        readable: false,
		        writable: true
		      });

		      // FIXME Should probably have an option in net.Socket to create a
		      // stream from an existing fd which is writable only. But for now
		      // we'll just add this hack and set the `readable` member to false.
		      // Test: ./node test/fixtures/echo.js < /etc/passwd
		      stream.readable = false;
		      stream.read = null;
		      stream._type = 'pipe';

		      // FIXME Hack to have stream not keep the event loop alive.
		      // See https://github.com/joyent/node/issues/1726
		      if (stream._handle && stream._handle.unref) {
		        stream._handle.unref();
		      }
		      break;

		    default:
		      // Probably an error on in uv_guess_handle()
		      throw new Error('Implement me. Unknown stream file type!');
		  }

		  // For supporting legacy API we put the FD here.
		  stream.fd = fd;

		  stream._isStdio = true;

		  return stream;
		}

		/**
		 * Init logic for `debug` instances.
		 *
		 * Create a new `inspectOpts` object in case `useColors` is set
		 * differently for a particular `debug` instance.
		 */

		function init (debug) {
		  debug.inspectOpts = {};

		  var keys = Object.keys(exports.inspectOpts);
		  for (var i = 0; i < keys.length; i++) {
		    debug.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
		  }
		}

		/**
		 * Enable namespaces listed in `process.env.DEBUG` initially.
		 */

		exports.enable(load()); 
	} (node, node.exports));
	return node.exports;
}

/**
 * Detect Electron renderer process, which is node, but we should
 * treat as a browser.
 */

var hasRequiredSrc;

function requireSrc () {
	if (hasRequiredSrc) return src.exports;
	hasRequiredSrc = 1;
	if (typeof process !== 'undefined' && process.type === 'renderer') {
	  src.exports = requireBrowser();
	} else {
	  src.exports = requireNode();
	}
	return src.exports;
}

const require$$0$3 = /*@__PURE__*/getAugmentedNamespace(http);

/*!
 * on-headers
 * Copyright(c) 2014 Douglas Christopher Wilson
 * MIT Licensed
 */

var onHeaders_1;
var hasRequiredOnHeaders;

function requireOnHeaders () {
	if (hasRequiredOnHeaders) return onHeaders_1;
	hasRequiredOnHeaders = 1;

	/**
	 * Module exports.
	 * @public
	 */

	onHeaders_1 = onHeaders;

	var http = require$$0$3;

	// older node versions don't have appendHeader
	var isAppendHeaderSupported = typeof http.ServerResponse.prototype.appendHeader === 'function';
	var set1dArray = isAppendHeaderSupported ? set1dArrayWithAppend : set1dArrayWithSet;

	/**
	 * Create a replacement writeHead method.
	 *
	 * @param {function} prevWriteHead
	 * @param {function} listener
	 * @private
	 */

	function createWriteHead (prevWriteHead, listener) {
	  var fired = false;

	  // return function with core name and argument list
	  return function writeHead (statusCode) {
	    // set headers from arguments
	    var args = setWriteHeadHeaders.apply(this, arguments);

	    // fire listener
	    if (!fired) {
	      fired = true;
	      listener.call(this);

	      // pass-along an updated status code
	      if (typeof args[0] === 'number' && this.statusCode !== args[0]) {
	        args[0] = this.statusCode;
	        args.length = 1;
	      }
	    }

	    return prevWriteHead.apply(this, args)
	  }
	}

	/**
	 * Execute a listener when a response is about to write headers.
	 *
	 * @param {object} res
	 * @return {function} listener
	 * @public
	 */

	function onHeaders (res, listener) {
	  if (!res) {
	    throw new TypeError('argument res is required')
	  }

	  if (typeof listener !== 'function') {
	    throw new TypeError('argument listener must be a function')
	  }

	  res.writeHead = createWriteHead(res.writeHead, listener);
	}

	/**
	 * Set headers contained in array on the response object.
	 *
	 * @param {object} res
	 * @param {array} headers
	 * @private
	 */

	function setHeadersFromArray (res, headers) {
	  if (headers.length && Array.isArray(headers[0])) {
	    // 2D
	    set2dArray(res, headers);
	  } else {
	    // 1D
	    if (headers.length % 2 !== 0) {
	      throw new TypeError('headers array is malformed')
	    }

	    set1dArray(res, headers);
	  }
	}

	/**
	 * Set headers contained in object on the response object.
	 *
	 * @param {object} res
	 * @param {object} headers
	 * @private
	 */

	function setHeadersFromObject (res, headers) {
	  var keys = Object.keys(headers);
	  for (var i = 0; i < keys.length; i++) {
	    var k = keys[i];
	    if (k) res.setHeader(k, headers[k]);
	  }
	}

	/**
	 * Set headers and other properties on the response object.
	 *
	 * @param {number} statusCode
	 * @private
	 */

	function setWriteHeadHeaders (statusCode) {
	  var length = arguments.length;
	  var headerIndex = length > 1 && typeof arguments[1] === 'string'
	    ? 2
	    : 1;

	  var headers = length >= headerIndex + 1
	    ? arguments[headerIndex]
	    : undefined;

	  this.statusCode = statusCode;

	  if (Array.isArray(headers)) {
	    // handle array case
	    setHeadersFromArray(this, headers);
	  } else if (headers) {
	    // handle object case
	    setHeadersFromObject(this, headers);
	  }

	  // copy leading arguments
	  var args = new Array(Math.min(length, headerIndex));
	  for (var i = 0; i < args.length; i++) {
	    args[i] = arguments[i];
	  }

	  return args
	}

	function set2dArray (res, headers) {
	  var key;
	  for (var i = 0; i < headers.length; i++) {
	    key = headers[i][0];
	    if (key) {
	      res.setHeader(key, headers[i][1]);
	    }
	  }
	}

	function set1dArrayWithAppend (res, headers) {
	  for (var i = 0; i < headers.length; i += 2) {
	    res.removeHeader(headers[i]);
	  }

	  var key;
	  for (var j = 0; j < headers.length; j += 2) {
	    key = headers[j];
	    if (key) {
	      res.appendHeader(key, headers[j + 1]);
	    }
	  }
	}

	function set1dArrayWithSet (res, headers) {
	  var key;
	  for (var i = 0; i < headers.length; i += 2) {
	    key = headers[i];
	    if (key) {
	      res.setHeader(key, headers[i + 1]);
	    }
	  }
	}
	return onHeaders_1;
}

var vary = {exports: {}};

/*!
 * vary
 * Copyright(c) 2014-2017 Douglas Christopher Wilson
 * MIT Licensed
 */

var hasRequiredVary;

function requireVary () {
	if (hasRequiredVary) return vary.exports;
	hasRequiredVary = 1;

	/**
	 * Module exports.
	 */

	vary.exports = vary$1;
	vary.exports.append = append;

	/**
	 * RegExp to match field-name in RFC 7230 sec 3.2
	 *
	 * field-name    = token
	 * token         = 1*tchar
	 * tchar         = "!" / "#" / "$" / "%" / "&" / "'" / "*"
	 *               / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~"
	 *               / DIGIT / ALPHA
	 *               ; any VCHAR, except delimiters
	 */

	var FIELD_NAME_REGEXP = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

	/**
	 * Append a field to a vary header.
	 *
	 * @param {String} header
	 * @param {String|Array} field
	 * @return {String}
	 * @public
	 */

	function append (header, field) {
	  if (typeof header !== 'string') {
	    throw new TypeError('header argument is required')
	  }

	  if (!field) {
	    throw new TypeError('field argument is required')
	  }

	  // get fields array
	  var fields = !Array.isArray(field)
	    ? parse(String(field))
	    : field;

	  // assert on invalid field names
	  for (var j = 0; j < fields.length; j++) {
	    if (!FIELD_NAME_REGEXP.test(fields[j])) {
	      throw new TypeError('field argument contains an invalid header name')
	    }
	  }

	  // existing, unspecified vary
	  if (header === '*') {
	    return header
	  }

	  // enumerate current values
	  var val = header;
	  var vals = parse(header.toLowerCase());

	  // unspecified vary
	  if (fields.indexOf('*') !== -1 || vals.indexOf('*') !== -1) {
	    return '*'
	  }

	  for (var i = 0; i < fields.length; i++) {
	    var fld = fields[i].toLowerCase();

	    // append value (case-preserving)
	    if (vals.indexOf(fld) === -1) {
	      vals.push(fld);
	      val = val
	        ? val + ', ' + fields[i]
	        : fields[i];
	    }
	  }

	  return val
	}

	/**
	 * Parse a vary header into an array.
	 *
	 * @param {String} header
	 * @return {Array}
	 * @private
	 */

	function parse (header) {
	  var end = 0;
	  var list = [];
	  var start = 0;

	  // gather tokens
	  for (var i = 0, len = header.length; i < len; i++) {
	    switch (header.charCodeAt(i)) {
	      case 0x20: /*   */
	        if (start === end) {
	          start = end = i + 1;
	        }
	        break
	      case 0x2c: /* , */
	        list.push(header.substring(start, end));
	        start = end = i + 1;
	        break
	      default:
	        end = i + 1;
	        break
	    }
	  }

	  // final token
	  list.push(header.substring(start, end));

	  return list
	}

	/**
	 * Mark that a request is varied on a header field.
	 *
	 * @param {Object} res
	 * @param {String|Array} field
	 * @public
	 */

	function vary$1 (res, field) {
	  if (!res || !res.getHeader || !res.setHeader) {
	    // quack quack
	    throw new TypeError('res argument is required')
	  }

	  // get existing header
	  var val = res.getHeader('Vary') || '';
	  var header = Array.isArray(val)
	    ? val.join(', ')
	    : String(val);

	  // set new header
	  if ((val = append(header, field))) {
	    res.setHeader('Vary', val);
	  }
	}
	return vary.exports;
}

const require$$3$1 = /*@__PURE__*/getAugmentedNamespace(zlib);

/*!
 * compression
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

var hasRequiredCompression;

function requireCompression () {
	if (hasRequiredCompression) return compression$1.exports;
	hasRequiredCompression = 1;

	/**
	 * Module dependencies.
	 * @private
	 */

	var Negotiator = requireNegotiator();
	var Buffer = requireSafeBuffer().Buffer;
	var bytes = requireBytes();
	var compressible = requireCompressible();
	var debug = requireSrc()('compression');
	var onHeaders = requireOnHeaders();
	var vary = requireVary();
	var zlib = require$$3$1;

	/**
	 * Module exports.
	 */

	compression$1.exports = compression;
	compression$1.exports.filter = shouldCompress;

	/**
	 * @const
	 * whether current node version has brotli support
	 */
	var hasBrotliSupport = 'createBrotliCompress' in zlib;

	/**
	 * Module variables.
	 * @private
	 */
	var cacheControlNoTransformRegExp = /(?:^|,)\s*?no-transform\s*?(?:,|$)/;
	var SUPPORTED_ENCODING = hasBrotliSupport ? ['br', 'gzip', 'deflate', 'identity'] : ['gzip', 'deflate', 'identity'];
	var PREFERRED_ENCODING = hasBrotliSupport ? ['br', 'gzip'] : ['gzip'];

	var encodingSupported = ['gzip', 'deflate', 'identity', 'br'];

	/**
	 * Compress response data with gzip / deflate.
	 *
	 * @param {Object} [options]
	 * @return {Function} middleware
	 * @public
	 */

	function compression (options) {
	  var opts = options || {};
	  var optsBrotli = {};

	  if (hasBrotliSupport) {
	    Object.assign(optsBrotli, opts.brotli);

	    var brotliParams = {};
	    brotliParams[zlib.constants.BROTLI_PARAM_QUALITY] = 4;

	    // set the default level to a reasonable value with balanced speed/ratio
	    optsBrotli.params = Object.assign(brotliParams, optsBrotli.params);
	  }

	  // options
	  var filter = opts.filter || shouldCompress;
	  var threshold = bytes.parse(opts.threshold);
	  var enforceEncoding = opts.enforceEncoding || 'identity';

	  if (threshold == null) {
	    threshold = 1024;
	  }

	  return function compression (req, res, next) {
	    var ended = false;
	    var length;
	    var listeners = [];
	    var stream;

	    var _end = res.end;
	    var _on = res.on;
	    var _write = res.write;

	    // flush
	    res.flush = function flush () {
	      if (stream) {
	        stream.flush();
	      }
	    };

	    // proxy

	    res.write = function write (chunk, encoding) {
	      if (ended) {
	        return false
	      }

	      if (!headersSent(res)) {
	        this.writeHead(this.statusCode);
	      }

	      return stream
	        ? stream.write(toBuffer(chunk, encoding))
	        : _write.call(this, chunk, encoding)
	    };

	    res.end = function end (chunk, encoding) {
	      if (ended) {
	        return false
	      }

	      if (!headersSent(res)) {
	        // estimate the length
	        if (!this.getHeader('Content-Length')) {
	          length = chunkLength(chunk, encoding);
	        }

	        this.writeHead(this.statusCode);
	      }

	      if (!stream) {
	        return _end.call(this, chunk, encoding)
	      }

	      // mark ended
	      ended = true;

	      // write Buffer for Node.js 0.8
	      return chunk
	        ? stream.end(toBuffer(chunk, encoding))
	        : stream.end()
	    };

	    res.on = function on (type, listener) {
	      if (!listeners || type !== 'drain') {
	        return _on.call(this, type, listener)
	      }

	      if (stream) {
	        return stream.on(type, listener)
	      }

	      // buffer listeners for future stream
	      listeners.push([type, listener]);

	      return this
	    };

	    function nocompress (msg) {
	      debug('no compression: %s', msg);
	      addListeners(res, _on, listeners);
	      listeners = null;
	    }

	    onHeaders(res, function onResponseHeaders () {
	      // determine if request is filtered
	      if (!filter(req, res)) {
	        nocompress('filtered');
	        return
	      }

	      // determine if the entity should be transformed
	      if (!shouldTransform(req, res)) {
	        nocompress('no transform');
	        return
	      }

	      // vary
	      vary(res, 'Accept-Encoding');

	      // content-length below threshold
	      if (Number(res.getHeader('Content-Length')) < threshold || length < threshold) {
	        nocompress('size below threshold');
	        return
	      }

	      var encoding = res.getHeader('Content-Encoding') || 'identity';

	      // already encoded
	      if (encoding !== 'identity') {
	        nocompress('already encoded');
	        return
	      }

	      // head
	      if (req.method === 'HEAD') {
	        nocompress('HEAD request');
	        return
	      }

	      // compression method
	      var negotiator = new Negotiator(req);
	      var method = negotiator.encoding(SUPPORTED_ENCODING, PREFERRED_ENCODING);

	      // if no method is found, use the default encoding
	      if (!req.headers['accept-encoding'] && encodingSupported.indexOf(enforceEncoding) !== -1) {
	        method = enforceEncoding;
	      }

	      // negotiation failed
	      if (!method || method === 'identity') {
	        nocompress('not acceptable');
	        return
	      }

	      // compression stream
	      debug('%s compression', method);
	      stream = method === 'gzip'
	        ? zlib.createGzip(opts)
	        : method === 'br'
	          ? zlib.createBrotliCompress(optsBrotli)
	          : zlib.createDeflate(opts);

	      // add buffered listeners to stream
	      addListeners(stream, stream.on, listeners);

	      // header fields
	      res.setHeader('Content-Encoding', method);
	      res.removeHeader('Content-Length');

	      // compression
	      stream.on('data', function onStreamData (chunk) {
	        if (_write.call(res, chunk) === false) {
	          stream.pause();
	        }
	      });

	      stream.on('end', function onStreamEnd () {
	        _end.call(res);
	      });

	      _on.call(res, 'drain', function onResponseDrain () {
	        stream.resume();
	      });
	    });

	    next();
	  }
	}

	/**
	 * Add bufferred listeners to stream
	 * @private
	 */

	function addListeners (stream, on, listeners) {
	  for (var i = 0; i < listeners.length; i++) {
	    on.apply(stream, listeners[i]);
	  }
	}

	/**
	 * Get the length of a given chunk
	 */

	function chunkLength (chunk, encoding) {
	  if (!chunk) {
	    return 0
	  }

	  return Buffer.isBuffer(chunk)
	    ? chunk.length
	    : Buffer.byteLength(chunk, encoding)
	}

	/**
	 * Default filter function.
	 * @private
	 */

	function shouldCompress (req, res) {
	  var type = res.getHeader('Content-Type');

	  if (type === undefined || !compressible(type)) {
	    debug('%s not compressible', type);
	    return false
	  }

	  return true
	}

	/**
	 * Determine if the entity should be transformed.
	 * @private
	 */

	function shouldTransform (req, res) {
	  var cacheControl = res.getHeader('Cache-Control');

	  // Don't compress for Cache-Control: no-transform
	  // https://tools.ietf.org/html/rfc7234#section-5.2.2.4
	  return !cacheControl ||
	    !cacheControlNoTransformRegExp.test(cacheControl)
	}

	/**
	 * Coerce arguments to Buffer
	 * @private
	 */

	function toBuffer (chunk, encoding) {
	  return Buffer.isBuffer(chunk)
	    ? chunk
	    : Buffer.from(chunk, encoding)
	}

	/**
	 * Determine if the response headers have been sent.
	 *
	 * @param {object} res
	 * @returns {boolean}
	 * @private
	 */

	function headersSent (res) {
	  return typeof res.headersSent !== 'boolean'
	    ? Boolean(res._header)
	    : res.headersSent
	}
	return compression$1.exports;
}

var compressionExports = requireCompression();
const compression = /*@__PURE__*/getDefaultExportFromCjs(compressionExports);

var serveStatic = {exports: {}};

/*!
 * encodeurl
 * Copyright(c) 2016 Douglas Christopher Wilson
 * MIT Licensed
 */

var encodeurl$1;
var hasRequiredEncodeurl$1;

function requireEncodeurl$1 () {
	if (hasRequiredEncodeurl$1) return encodeurl$1;
	hasRequiredEncodeurl$1 = 1;

	/**
	 * Module exports.
	 * @public
	 */

	encodeurl$1 = encodeUrl;

	/**
	 * RegExp to match non-URL code points, *after* encoding (i.e. not including "%")
	 * and including invalid escape sequences.
	 * @private
	 */

	var ENCODE_CHARS_REGEXP = /(?:[^\x21\x23-\x3B\x3D\x3F-\x5F\x61-\x7A\x7C\x7E]|%(?:[^0-9A-Fa-f]|[0-9A-Fa-f][^0-9A-Fa-f]|$))+/g;

	/**
	 * RegExp to match unmatched surrogate pair.
	 * @private
	 */

	var UNMATCHED_SURROGATE_PAIR_REGEXP = /(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF]([^\uDC00-\uDFFF]|$)/g;

	/**
	 * String to replace unmatched surrogate pair with.
	 * @private
	 */

	var UNMATCHED_SURROGATE_PAIR_REPLACE = '$1\uFFFD$2';

	/**
	 * Encode a URL to a percent-encoded form, excluding already-encoded sequences.
	 *
	 * This function will take an already-encoded URL and encode all the non-URL
	 * code points. This function will not encode the "%" character unless it is
	 * not part of a valid sequence (`%20` will be left as-is, but `%foo` will
	 * be encoded as `%25foo`).
	 *
	 * This encode is meant to be "safe" and does not throw errors. It will try as
	 * hard as it can to properly encode the given URL, including replacing any raw,
	 * unpaired surrogate pairs with the Unicode replacement character prior to
	 * encoding.
	 *
	 * @param {string} url
	 * @return {string}
	 * @public
	 */

	function encodeUrl (url) {
	  return String(url)
	    .replace(UNMATCHED_SURROGATE_PAIR_REGEXP, UNMATCHED_SURROGATE_PAIR_REPLACE)
	    .replace(ENCODE_CHARS_REGEXP, encodeURI)
	}
	return encodeurl$1;
}

/*!
 * escape-html
 * Copyright(c) 2012-2013 TJ Holowaychuk
 * Copyright(c) 2015 Andreas Lubbe
 * Copyright(c) 2015 Tiancheng "Timothy" Gu
 * MIT Licensed
 */

var escapeHtml_1;
var hasRequiredEscapeHtml;

function requireEscapeHtml () {
	if (hasRequiredEscapeHtml) return escapeHtml_1;
	hasRequiredEscapeHtml = 1;

	/**
	 * Module variables.
	 * @private
	 */

	var matchHtmlRegExp = /["'&<>]/;

	/**
	 * Module exports.
	 * @public
	 */

	escapeHtml_1 = escapeHtml;

	/**
	 * Escape special characters in the given string of html.
	 *
	 * @param  {string} string The string to escape for inserting into HTML
	 * @return {string}
	 * @public
	 */

	function escapeHtml(string) {
	  var str = '' + string;
	  var match = matchHtmlRegExp.exec(str);

	  if (!match) {
	    return str;
	  }

	  var escape;
	  var html = '';
	  var index = 0;
	  var lastIndex = 0;

	  for (index = match.index; index < str.length; index++) {
	    switch (str.charCodeAt(index)) {
	      case 34: // "
	        escape = '&quot;';
	        break;
	      case 38: // &
	        escape = '&amp;';
	        break;
	      case 39: // '
	        escape = '&#39;';
	        break;
	      case 60: // <
	        escape = '&lt;';
	        break;
	      case 62: // >
	        escape = '&gt;';
	        break;
	      default:
	        continue;
	    }

	    if (lastIndex !== index) {
	      html += str.substring(lastIndex, index);
	    }

	    lastIndex = index + 1;
	    html += escape;
	  }

	  return lastIndex !== index
	    ? html + str.substring(lastIndex, index)
	    : html;
	}
	return escapeHtml_1;
}

var parseurl = {exports: {}};

const require$$5 = /*@__PURE__*/getAugmentedNamespace(url);

/*!
 * parseurl
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2014-2017 Douglas Christopher Wilson
 * MIT Licensed
 */

var hasRequiredParseurl;

function requireParseurl () {
	if (hasRequiredParseurl) return parseurl.exports;
	hasRequiredParseurl = 1;

	/**
	 * Module dependencies.
	 * @private
	 */

	var url = require$$5;
	var parse = url.parse;
	var Url = url.Url;

	/**
	 * Module exports.
	 * @public
	 */

	parseurl.exports = parseurl$1;
	parseurl.exports.original = originalurl;

	/**
	 * Parse the `req` url with memoization.
	 *
	 * @param {ServerRequest} req
	 * @return {Object}
	 * @public
	 */

	function parseurl$1 (req) {
	  var url = req.url;

	  if (url === undefined) {
	    // URL is undefined
	    return undefined
	  }

	  var parsed = req._parsedUrl;

	  if (fresh(url, parsed)) {
	    // Return cached URL parse
	    return parsed
	  }

	  // Parse the URL
	  parsed = fastparse(url);
	  parsed._raw = url;

	  return (req._parsedUrl = parsed)
	}
	/**
	 * Parse the `req` original url with fallback and memoization.
	 *
	 * @param {ServerRequest} req
	 * @return {Object}
	 * @public
	 */

	function originalurl (req) {
	  var url = req.originalUrl;

	  if (typeof url !== 'string') {
	    // Fallback
	    return parseurl$1(req)
	  }

	  var parsed = req._parsedOriginalUrl;

	  if (fresh(url, parsed)) {
	    // Return cached URL parse
	    return parsed
	  }

	  // Parse the URL
	  parsed = fastparse(url);
	  parsed._raw = url;

	  return (req._parsedOriginalUrl = parsed)
	}
	/**
	 * Parse the `str` url with fast-path short-cut.
	 *
	 * @param {string} str
	 * @return {Object}
	 * @private
	 */

	function fastparse (str) {
	  if (typeof str !== 'string' || str.charCodeAt(0) !== 0x2f /* / */) {
	    return parse(str)
	  }

	  var pathname = str;
	  var query = null;
	  var search = null;

	  // This takes the regexp from https://github.com/joyent/node/pull/7878
	  // Which is /^(\/[^?#\s]*)(\?[^#\s]*)?$/
	  // And unrolls it into a for loop
	  for (var i = 1; i < str.length; i++) {
	    switch (str.charCodeAt(i)) {
	      case 0x3f: /* ?  */
	        if (search === null) {
	          pathname = str.substring(0, i);
	          query = str.substring(i + 1);
	          search = str.substring(i);
	        }
	        break
	      case 0x09: /* \t */
	      case 0x0a: /* \n */
	      case 0x0c: /* \f */
	      case 0x0d: /* \r */
	      case 0x20: /*    */
	      case 0x23: /* #  */
	      case 0xa0:
	      case 0xfeff:
	        return parse(str)
	    }
	  }

	  var url = Url !== undefined
	    ? new Url()
	    : {};

	  url.path = str;
	  url.href = str;
	  url.pathname = pathname;

	  if (search !== null) {
	    url.query = query;
	    url.search = search;
	  }

	  return url
	}

	/**
	 * Determine if parsed is still fresh for url.
	 *
	 * @param {string} url
	 * @param {object} parsedUrl
	 * @return {boolean}
	 * @private
	 */

	function fresh (url, parsedUrl) {
	  return typeof parsedUrl === 'object' &&
	    parsedUrl !== null &&
	    (Url === undefined || parsedUrl instanceof Url) &&
	    parsedUrl._raw === url
	}
	return parseurl.exports;
}

const require$$3 = /*@__PURE__*/getAugmentedNamespace(path);

var send = {exports: {}};

var httpErrors = {exports: {}};

/*!
 * depd
 * Copyright(c) 2014-2018 Douglas Christopher Wilson
 * MIT Licensed
 */

var depd_1;
var hasRequiredDepd;

function requireDepd () {
	if (hasRequiredDepd) return depd_1;
	hasRequiredDepd = 1;
	/**
	 * Module dependencies.
	 */

	var relative = require$$3.relative;

	/**
	 * Module exports.
	 */

	depd_1 = depd;

	/**
	 * Get the path to base files on.
	 */

	var basePath = process.cwd();

	/**
	 * Determine if namespace is contained in the string.
	 */

	function containsNamespace (str, namespace) {
	  var vals = str.split(/[ ,]+/);
	  var ns = String(namespace).toLowerCase();

	  for (var i = 0; i < vals.length; i++) {
	    var val = vals[i];

	    // namespace contained
	    if (val && (val === '*' || val.toLowerCase() === ns)) {
	      return true
	    }
	  }

	  return false
	}

	/**
	 * Convert a data descriptor to accessor descriptor.
	 */

	function convertDataDescriptorToAccessor (obj, prop, message) {
	  var descriptor = Object.getOwnPropertyDescriptor(obj, prop);
	  var value = descriptor.value;

	  descriptor.get = function getter () { return value };

	  if (descriptor.writable) {
	    descriptor.set = function setter (val) { return (value = val) };
	  }

	  delete descriptor.value;
	  delete descriptor.writable;

	  Object.defineProperty(obj, prop, descriptor);

	  return descriptor
	}

	/**
	 * Create arguments string to keep arity.
	 */

	function createArgumentsString (arity) {
	  var str = '';

	  for (var i = 0; i < arity; i++) {
	    str += ', arg' + i;
	  }

	  return str.substr(2)
	}

	/**
	 * Create stack string from stack.
	 */

	function createStackString (stack) {
	  var str = this.name + ': ' + this.namespace;

	  if (this.message) {
	    str += ' deprecated ' + this.message;
	  }

	  for (var i = 0; i < stack.length; i++) {
	    str += '\n    at ' + stack[i].toString();
	  }

	  return str
	}

	/**
	 * Create deprecate for namespace in caller.
	 */

	function depd (namespace) {
	  if (!namespace) {
	    throw new TypeError('argument namespace is required')
	  }

	  var stack = getStack();
	  var site = callSiteLocation(stack[1]);
	  var file = site[0];

	  function deprecate (message) {
	    // call to self as log
	    log.call(deprecate, message);
	  }

	  deprecate._file = file;
	  deprecate._ignored = isignored(namespace);
	  deprecate._namespace = namespace;
	  deprecate._traced = istraced(namespace);
	  deprecate._warned = Object.create(null);

	  deprecate.function = wrapfunction;
	  deprecate.property = wrapproperty;

	  return deprecate
	}

	/**
	 * Determine if event emitter has listeners of a given type.
	 *
	 * The way to do this check is done three different ways in Node.js >= 0.8
	 * so this consolidates them into a minimal set using instance methods.
	 *
	 * @param {EventEmitter} emitter
	 * @param {string} type
	 * @returns {boolean}
	 * @private
	 */

	function eehaslisteners (emitter, type) {
	  var count = typeof emitter.listenerCount !== 'function'
	    ? emitter.listeners(type).length
	    : emitter.listenerCount(type);

	  return count > 0
	}

	/**
	 * Determine if namespace is ignored.
	 */

	function isignored (namespace) {
	  if (process.noDeprecation) {
	    // --no-deprecation support
	    return true
	  }

	  var str = process.env.NO_DEPRECATION || '';

	  // namespace ignored
	  return containsNamespace(str, namespace)
	}

	/**
	 * Determine if namespace is traced.
	 */

	function istraced (namespace) {
	  if (process.traceDeprecation) {
	    // --trace-deprecation support
	    return true
	  }

	  var str = process.env.TRACE_DEPRECATION || '';

	  // namespace traced
	  return containsNamespace(str, namespace)
	}

	/**
	 * Display deprecation message.
	 */

	function log (message, site) {
	  var haslisteners = eehaslisteners(process, 'deprecation');

	  // abort early if no destination
	  if (!haslisteners && this._ignored) {
	    return
	  }

	  var caller;
	  var callFile;
	  var callSite;
	  var depSite;
	  var i = 0;
	  var seen = false;
	  var stack = getStack();
	  var file = this._file;

	  if (site) {
	    // provided site
	    depSite = site;
	    callSite = callSiteLocation(stack[1]);
	    callSite.name = depSite.name;
	    file = callSite[0];
	  } else {
	    // get call site
	    i = 2;
	    depSite = callSiteLocation(stack[i]);
	    callSite = depSite;
	  }

	  // get caller of deprecated thing in relation to file
	  for (; i < stack.length; i++) {
	    caller = callSiteLocation(stack[i]);
	    callFile = caller[0];

	    if (callFile === file) {
	      seen = true;
	    } else if (callFile === this._file) {
	      file = this._file;
	    } else if (seen) {
	      break
	    }
	  }

	  var key = caller
	    ? depSite.join(':') + '__' + caller.join(':')
	    : undefined;

	  if (key !== undefined && key in this._warned) {
	    // already warned
	    return
	  }

	  this._warned[key] = true;

	  // generate automatic message from call site
	  var msg = message;
	  if (!msg) {
	    msg = callSite === depSite || !callSite.name
	      ? defaultMessage(depSite)
	      : defaultMessage(callSite);
	  }

	  // emit deprecation if listeners exist
	  if (haslisteners) {
	    var err = DeprecationError(this._namespace, msg, stack.slice(i));
	    process.emit('deprecation', err);
	    return
	  }

	  // format and write message
	  var format = process.stderr.isTTY
	    ? formatColor
	    : formatPlain;
	  var output = format.call(this, msg, caller, stack.slice(i));
	  process.stderr.write(output + '\n', 'utf8');
	}

	/**
	 * Get call site location as array.
	 */

	function callSiteLocation (callSite) {
	  var file = callSite.getFileName() || '<anonymous>';
	  var line = callSite.getLineNumber();
	  var colm = callSite.getColumnNumber();

	  if (callSite.isEval()) {
	    file = callSite.getEvalOrigin() + ', ' + file;
	  }

	  var site = [file, line, colm];

	  site.callSite = callSite;
	  site.name = callSite.getFunctionName();

	  return site
	}

	/**
	 * Generate a default message from the site.
	 */

	function defaultMessage (site) {
	  var callSite = site.callSite;
	  var funcName = site.name;

	  // make useful anonymous name
	  if (!funcName) {
	    funcName = '<anonymous@' + formatLocation(site) + '>';
	  }

	  var context = callSite.getThis();
	  var typeName = context && callSite.getTypeName();

	  // ignore useless type name
	  if (typeName === 'Object') {
	    typeName = undefined;
	  }

	  // make useful type name
	  if (typeName === 'Function') {
	    typeName = context.name || typeName;
	  }

	  return typeName && callSite.getMethodName()
	    ? typeName + '.' + funcName
	    : funcName
	}

	/**
	 * Format deprecation message without color.
	 */

	function formatPlain (msg, caller, stack) {
	  var timestamp = new Date().toUTCString();

	  var formatted = timestamp +
	    ' ' + this._namespace +
	    ' deprecated ' + msg;

	  // add stack trace
	  if (this._traced) {
	    for (var i = 0; i < stack.length; i++) {
	      formatted += '\n    at ' + stack[i].toString();
	    }

	    return formatted
	  }

	  if (caller) {
	    formatted += ' at ' + formatLocation(caller);
	  }

	  return formatted
	}

	/**
	 * Format deprecation message with color.
	 */

	function formatColor (msg, caller, stack) {
	  var formatted = '\x1b[36;1m' + this._namespace + '\x1b[22;39m' + // bold cyan
	    ' \x1b[33;1mdeprecated\x1b[22;39m' + // bold yellow
	    ' \x1b[0m' + msg + '\x1b[39m'; // reset

	  // add stack trace
	  if (this._traced) {
	    for (var i = 0; i < stack.length; i++) {
	      formatted += '\n    \x1b[36mat ' + stack[i].toString() + '\x1b[39m'; // cyan
	    }

	    return formatted
	  }

	  if (caller) {
	    formatted += ' \x1b[36m' + formatLocation(caller) + '\x1b[39m'; // cyan
	  }

	  return formatted
	}

	/**
	 * Format call site location.
	 */

	function formatLocation (callSite) {
	  return relative(basePath, callSite[0]) +
	    ':' + callSite[1] +
	    ':' + callSite[2]
	}

	/**
	 * Get the stack as array of call sites.
	 */

	function getStack () {
	  var limit = Error.stackTraceLimit;
	  var obj = {};
	  var prep = Error.prepareStackTrace;

	  Error.prepareStackTrace = prepareObjectStackTrace;
	  Error.stackTraceLimit = Math.max(10, limit);

	  // capture the stack
	  Error.captureStackTrace(obj);

	  // slice this function off the top
	  var stack = obj.stack.slice(1);

	  Error.prepareStackTrace = prep;
	  Error.stackTraceLimit = limit;

	  return stack
	}

	/**
	 * Capture call site stack from v8.
	 */

	function prepareObjectStackTrace (obj, stack) {
	  return stack
	}

	/**
	 * Return a wrapped function in a deprecation message.
	 */

	function wrapfunction (fn, message) {
	  if (typeof fn !== 'function') {
	    throw new TypeError('argument fn must be a function')
	  }

	  var args = createArgumentsString(fn.length);
	  var stack = getStack();
	  var site = callSiteLocation(stack[1]);

	  site.name = fn.name;

	  // eslint-disable-next-line no-new-func
	  var deprecatedfn = new Function('fn', 'log', 'deprecate', 'message', 'site',
	    '"use strict"\n' +
	    'return function (' + args + ') {' +
	    'log.call(deprecate, message, site)\n' +
	    'return fn.apply(this, arguments)\n' +
	    '}')(fn, log, this, message, site);

	  return deprecatedfn
	}

	/**
	 * Wrap property in a deprecation message.
	 */

	function wrapproperty (obj, prop, message) {
	  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) {
	    throw new TypeError('argument obj must be object')
	  }

	  var descriptor = Object.getOwnPropertyDescriptor(obj, prop);

	  if (!descriptor) {
	    throw new TypeError('must call property on owner object')
	  }

	  if (!descriptor.configurable) {
	    throw new TypeError('property must be configurable')
	  }

	  var deprecate = this;
	  var stack = getStack();
	  var site = callSiteLocation(stack[1]);

	  // set site name
	  site.name = prop;

	  // convert data descriptor
	  if ('value' in descriptor) {
	    descriptor = convertDataDescriptorToAccessor(obj, prop);
	  }

	  var get = descriptor.get;
	  var set = descriptor.set;

	  // wrap getter
	  if (typeof get === 'function') {
	    descriptor.get = function getter () {
	      log.call(deprecate, message, site);
	      return get.apply(this, arguments)
	    };
	  }

	  // wrap setter
	  if (typeof set === 'function') {
	    descriptor.set = function setter () {
	      log.call(deprecate, message, site);
	      return set.apply(this, arguments)
	    };
	  }

	  Object.defineProperty(obj, prop, descriptor);
	}

	/**
	 * Create DeprecationError for deprecation
	 */

	function DeprecationError (namespace, message, stack) {
	  var error = new Error();
	  var stackString;

	  Object.defineProperty(error, 'constructor', {
	    value: DeprecationError
	  });

	  Object.defineProperty(error, 'message', {
	    configurable: true,
	    enumerable: false,
	    value: message,
	    writable: true
	  });

	  Object.defineProperty(error, 'name', {
	    enumerable: false,
	    configurable: true,
	    value: 'DeprecationError',
	    writable: true
	  });

	  Object.defineProperty(error, 'namespace', {
	    configurable: true,
	    enumerable: false,
	    value: namespace,
	    writable: true
	  });

	  Object.defineProperty(error, 'stack', {
	    configurable: true,
	    enumerable: false,
	    get: function () {
	      if (stackString !== undefined) {
	        return stackString
	      }

	      // prepare stack trace
	      return (stackString = createStackString.call(this, stack))
	    },
	    set: function setter (val) {
	      stackString = val;
	    }
	  });

	  return error
	}
	return depd_1;
}

var setprototypeof;
var hasRequiredSetprototypeof;

function requireSetprototypeof () {
	if (hasRequiredSetprototypeof) return setprototypeof;
	hasRequiredSetprototypeof = 1;
	/* eslint no-proto: 0 */
	setprototypeof = Object.setPrototypeOf || ({ __proto__: [] } instanceof Array ? setProtoOf : mixinProperties);

	function setProtoOf (obj, proto) {
	  obj.__proto__ = proto;
	  return obj
	}

	function mixinProperties (obj, proto) {
	  for (var prop in proto) {
	    if (!Object.prototype.hasOwnProperty.call(obj, prop)) {
	      obj[prop] = proto[prop];
	    }
	  }
	  return obj
	}
	return setprototypeof;
}

const require$$0$2 = {
  "100": "Continue",
  "101": "Switching Protocols",
  "102": "Processing",
  "103": "Early Hints",
  "200": "OK",
  "201": "Created",
  "202": "Accepted",
  "203": "Non-Authoritative Information",
  "204": "No Content",
  "205": "Reset Content",
  "206": "Partial Content",
  "207": "Multi-Status",
  "208": "Already Reported",
  "226": "IM Used",
  "300": "Multiple Choices",
  "301": "Moved Permanently",
  "302": "Found",
  "303": "See Other",
  "304": "Not Modified",
  "305": "Use Proxy",
  "307": "Temporary Redirect",
  "308": "Permanent Redirect",
  "400": "Bad Request",
  "401": "Unauthorized",
  "402": "Payment Required",
  "403": "Forbidden",
  "404": "Not Found",
  "405": "Method Not Allowed",
  "406": "Not Acceptable",
  "407": "Proxy Authentication Required",
  "408": "Request Timeout",
  "409": "Conflict",
  "410": "Gone",
  "411": "Length Required",
  "412": "Precondition Failed",
  "413": "Payload Too Large",
  "414": "URI Too Long",
  "415": "Unsupported Media Type",
  "416": "Range Not Satisfiable",
  "417": "Expectation Failed",
  "418": "I'm a Teapot",
  "421": "Misdirected Request",
  "422": "Unprocessable Entity",
  "423": "Locked",
  "424": "Failed Dependency",
  "425": "Too Early",
  "426": "Upgrade Required",
  "428": "Precondition Required",
  "429": "Too Many Requests",
  "431": "Request Header Fields Too Large",
  "451": "Unavailable For Legal Reasons",
  "500": "Internal Server Error",
  "501": "Not Implemented",
  "502": "Bad Gateway",
  "503": "Service Unavailable",
  "504": "Gateway Timeout",
  "505": "HTTP Version Not Supported",
  "506": "Variant Also Negotiates",
  "507": "Insufficient Storage",
  "508": "Loop Detected",
  "509": "Bandwidth Limit Exceeded",
  "510": "Not Extended",
  "511": "Network Authentication Required",
};

/*!
 * statuses
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2016 Douglas Christopher Wilson
 * MIT Licensed
 */

var statuses;
var hasRequiredStatuses;

function requireStatuses () {
	if (hasRequiredStatuses) return statuses;
	hasRequiredStatuses = 1;

	/**
	 * Module dependencies.
	 * @private
	 */

	var codes = require$$0$2;

	/**
	 * Module exports.
	 * @public
	 */

	statuses = status;

	// status code to message map
	status.message = codes;

	// status message (lower-case) to code map
	status.code = createMessageToStatusCodeMap(codes);

	// array of status codes
	status.codes = createStatusCodeList(codes);

	// status codes for redirects
	status.redirect = {
	  300: true,
	  301: true,
	  302: true,
	  303: true,
	  305: true,
	  307: true,
	  308: true
	};

	// status codes for empty bodies
	status.empty = {
	  204: true,
	  205: true,
	  304: true
	};

	// status codes for when you should retry the request
	status.retry = {
	  502: true,
	  503: true,
	  504: true
	};

	/**
	 * Create a map of message to status code.
	 * @private
	 */

	function createMessageToStatusCodeMap (codes) {
	  var map = {};

	  Object.keys(codes).forEach(function forEachCode (code) {
	    var message = codes[code];
	    var status = Number(code);

	    // populate map
	    map[message.toLowerCase()] = status;
	  });

	  return map
	}

	/**
	 * Create a list of all status codes.
	 * @private
	 */

	function createStatusCodeList (codes) {
	  return Object.keys(codes).map(function mapCode (code) {
	    return Number(code)
	  })
	}

	/**
	 * Get the status code for given message.
	 * @private
	 */

	function getStatusCode (message) {
	  var msg = message.toLowerCase();

	  if (!Object.prototype.hasOwnProperty.call(status.code, msg)) {
	    throw new Error('invalid status message: "' + message + '"')
	  }

	  return status.code[msg]
	}

	/**
	 * Get the status message for given code.
	 * @private
	 */

	function getStatusMessage (code) {
	  if (!Object.prototype.hasOwnProperty.call(status.message, code)) {
	    throw new Error('invalid status code: ' + code)
	  }

	  return status.message[code]
	}

	/**
	 * Get the status code.
	 *
	 * Given a number, this will throw if it is not a known status
	 * code, otherwise the code will be returned. Given a string,
	 * the string will be parsed for a number and return the code
	 * if valid, otherwise will lookup the code assuming this is
	 * the status message.
	 *
	 * @param {string|number} code
	 * @returns {number}
	 * @public
	 */

	function status (code) {
	  if (typeof code === 'number') {
	    return getStatusMessage(code)
	  }

	  if (typeof code !== 'string') {
	    throw new TypeError('code must be a number or string')
	  }

	  // '403'
	  var n = parseInt(code, 10);
	  if (!isNaN(n)) {
	    return getStatusMessage(n)
	  }

	  return getStatusCode(code)
	}
	return statuses;
}

var inherits = {exports: {}};

var inherits_browser = {exports: {}};

var hasRequiredInherits_browser;

function requireInherits_browser () {
	if (hasRequiredInherits_browser) return inherits_browser.exports;
	hasRequiredInherits_browser = 1;
	if (typeof Object.create === 'function') {
	  // implementation from standard node.js 'util' module
	  inherits_browser.exports = function inherits(ctor, superCtor) {
	    if (superCtor) {
	      ctor.super_ = superCtor;
	      ctor.prototype = Object.create(superCtor.prototype, {
	        constructor: {
	          value: ctor,
	          enumerable: false,
	          writable: true,
	          configurable: true
	        }
	      });
	    }
	  };
	} else {
	  // old school shim for old browsers
	  inherits_browser.exports = function inherits(ctor, superCtor) {
	    if (superCtor) {
	      ctor.super_ = superCtor;
	      var TempCtor = function () {};
	      TempCtor.prototype = superCtor.prototype;
	      ctor.prototype = new TempCtor();
	      ctor.prototype.constructor = ctor;
	    }
	  };
	}
	return inherits_browser.exports;
}

var hasRequiredInherits;

function requireInherits () {
	if (hasRequiredInherits) return inherits.exports;
	hasRequiredInherits = 1;
	try {
	  var util = require('util');
	  /* istanbul ignore next */
	  if (typeof util.inherits !== 'function') throw '';
	  inherits.exports = util.inherits;
	} catch (e) {
	  /* istanbul ignore next */
	  inherits.exports = requireInherits_browser();
	}
	return inherits.exports;
}

/*!
 * toidentifier
 * Copyright(c) 2016 Douglas Christopher Wilson
 * MIT Licensed
 */

var toidentifier;
var hasRequiredToidentifier;

function requireToidentifier () {
	if (hasRequiredToidentifier) return toidentifier;
	hasRequiredToidentifier = 1;

	/**
	 * Module exports.
	 * @public
	 */

	toidentifier = toIdentifier;

	/**
	 * Trasform the given string into a JavaScript identifier
	 *
	 * @param {string} str
	 * @returns {string}
	 * @public
	 */

	function toIdentifier (str) {
	  return str
	    .split(' ')
	    .map(function (token) {
	      return token.slice(0, 1).toUpperCase() + token.slice(1)
	    })
	    .join('')
	    .replace(/[^ _0-9a-z]/gi, '')
	}
	return toidentifier;
}

/*!
 * http-errors
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2016 Douglas Christopher Wilson
 * MIT Licensed
 */

var hasRequiredHttpErrors;

function requireHttpErrors () {
	if (hasRequiredHttpErrors) return httpErrors.exports;
	hasRequiredHttpErrors = 1;
	(function (module) {

		/**
		 * Module dependencies.
		 * @private
		 */

		var deprecate = requireDepd()('http-errors');
		var setPrototypeOf = requireSetprototypeof();
		var statuses = requireStatuses();
		var inherits = requireInherits();
		var toIdentifier = requireToidentifier();

		/**
		 * Module exports.
		 * @public
		 */

		module.exports = createError;
		module.exports.HttpError = createHttpErrorConstructor();
		module.exports.isHttpError = createIsHttpErrorFunction(module.exports.HttpError);

		// Populate exports for all constructors
		populateConstructorExports(module.exports, statuses.codes, module.exports.HttpError);

		/**
		 * Get the code class of a status code.
		 * @private
		 */

		function codeClass (status) {
		  return Number(String(status).charAt(0) + '00')
		}

		/**
		 * Create a new HTTP Error.
		 *
		 * @returns {Error}
		 * @public
		 */

		function createError () {
		  // so much arity going on ~_~
		  var err;
		  var msg;
		  var status = 500;
		  var props = {};
		  for (var i = 0; i < arguments.length; i++) {
		    var arg = arguments[i];
		    var type = typeof arg;
		    if (type === 'object' && arg instanceof Error) {
		      err = arg;
		      status = err.status || err.statusCode || status;
		    } else if (type === 'number' && i === 0) {
		      status = arg;
		    } else if (type === 'string') {
		      msg = arg;
		    } else if (type === 'object') {
		      props = arg;
		    } else {
		      throw new TypeError('argument #' + (i + 1) + ' unsupported type ' + type)
		    }
		  }

		  if (typeof status === 'number' && (status < 400 || status >= 600)) {
		    deprecate('non-error status code; use only 4xx or 5xx status codes');
		  }

		  if (typeof status !== 'number' ||
		    (!statuses.message[status] && (status < 400 || status >= 600))) {
		    status = 500;
		  }

		  // constructor
		  var HttpError = createError[status] || createError[codeClass(status)];

		  if (!err) {
		    // create error
		    err = HttpError
		      ? new HttpError(msg)
		      : new Error(msg || statuses.message[status]);
		    Error.captureStackTrace(err, createError);
		  }

		  if (!HttpError || !(err instanceof HttpError) || err.status !== status) {
		    // add properties to generic error
		    err.expose = status < 500;
		    err.status = err.statusCode = status;
		  }

		  for (var key in props) {
		    if (key !== 'status' && key !== 'statusCode') {
		      err[key] = props[key];
		    }
		  }

		  return err
		}

		/**
		 * Create HTTP error abstract base class.
		 * @private
		 */

		function createHttpErrorConstructor () {
		  function HttpError () {
		    throw new TypeError('cannot construct abstract class')
		  }

		  inherits(HttpError, Error);

		  return HttpError
		}

		/**
		 * Create a constructor for a client error.
		 * @private
		 */

		function createClientErrorConstructor (HttpError, name, code) {
		  var className = toClassName(name);

		  function ClientError (message) {
		    // create the error object
		    var msg = message != null ? message : statuses.message[code];
		    var err = new Error(msg);

		    // capture a stack trace to the construction point
		    Error.captureStackTrace(err, ClientError);

		    // adjust the [[Prototype]]
		    setPrototypeOf(err, ClientError.prototype);

		    // redefine the error message
		    Object.defineProperty(err, 'message', {
		      enumerable: true,
		      configurable: true,
		      value: msg,
		      writable: true
		    });

		    // redefine the error name
		    Object.defineProperty(err, 'name', {
		      enumerable: false,
		      configurable: true,
		      value: className,
		      writable: true
		    });

		    return err
		  }

		  inherits(ClientError, HttpError);
		  nameFunc(ClientError, className);

		  ClientError.prototype.status = code;
		  ClientError.prototype.statusCode = code;
		  ClientError.prototype.expose = true;

		  return ClientError
		}

		/**
		 * Create function to test is a value is a HttpError.
		 * @private
		 */

		function createIsHttpErrorFunction (HttpError) {
		  return function isHttpError (val) {
		    if (!val || typeof val !== 'object') {
		      return false
		    }

		    if (val instanceof HttpError) {
		      return true
		    }

		    return val instanceof Error &&
		      typeof val.expose === 'boolean' &&
		      typeof val.statusCode === 'number' && val.status === val.statusCode
		  }
		}

		/**
		 * Create a constructor for a server error.
		 * @private
		 */

		function createServerErrorConstructor (HttpError, name, code) {
		  var className = toClassName(name);

		  function ServerError (message) {
		    // create the error object
		    var msg = message != null ? message : statuses.message[code];
		    var err = new Error(msg);

		    // capture a stack trace to the construction point
		    Error.captureStackTrace(err, ServerError);

		    // adjust the [[Prototype]]
		    setPrototypeOf(err, ServerError.prototype);

		    // redefine the error message
		    Object.defineProperty(err, 'message', {
		      enumerable: true,
		      configurable: true,
		      value: msg,
		      writable: true
		    });

		    // redefine the error name
		    Object.defineProperty(err, 'name', {
		      enumerable: false,
		      configurable: true,
		      value: className,
		      writable: true
		    });

		    return err
		  }

		  inherits(ServerError, HttpError);
		  nameFunc(ServerError, className);

		  ServerError.prototype.status = code;
		  ServerError.prototype.statusCode = code;
		  ServerError.prototype.expose = false;

		  return ServerError
		}

		/**
		 * Set the name of a function, if possible.
		 * @private
		 */

		function nameFunc (func, name) {
		  var desc = Object.getOwnPropertyDescriptor(func, 'name');

		  if (desc && desc.configurable) {
		    desc.value = name;
		    Object.defineProperty(func, 'name', desc);
		  }
		}

		/**
		 * Populate the exports object with constructors for every error class.
		 * @private
		 */

		function populateConstructorExports (exports, codes, HttpError) {
		  codes.forEach(function forEachCode (code) {
		    var CodeError;
		    var name = toIdentifier(statuses.message[code]);

		    switch (codeClass(code)) {
		      case 400:
		        CodeError = createClientErrorConstructor(HttpError, name, code);
		        break
		      case 500:
		        CodeError = createServerErrorConstructor(HttpError, name, code);
		        break
		    }

		    if (CodeError) {
		      // export the constructor
		      exports[code] = CodeError;
		      exports[name] = CodeError;
		    }
		  });
		}

		/**
		 * Get a class name from a name identifier.
		 * @private
		 */

		function toClassName (name) {
		  return name.substr(-5) !== 'Error'
		    ? name + 'Error'
		    : name
		} 
	} (httpErrors));
	return httpErrors.exports;
}

const require$$0$1 = /*@__PURE__*/getAugmentedNamespace(events);

const require$$15 = /*@__PURE__*/getAugmentedNamespace(stream);

/*!
 * destroy
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015-2022 Douglas Christopher Wilson
 * MIT Licensed
 */

var destroy_1;
var hasRequiredDestroy;

function requireDestroy () {
	if (hasRequiredDestroy) return destroy_1;
	hasRequiredDestroy = 1;

	/**
	 * Module dependencies.
	 * @private
	 */

	var EventEmitter = require$$0$1.EventEmitter;
	var ReadStream = require$$8.ReadStream;
	var Stream = require$$15;
	var Zlib = require$$3$1;

	/**
	 * Module exports.
	 * @public
	 */

	destroy_1 = destroy;

	/**
	 * Destroy the given stream, and optionally suppress any future `error` events.
	 *
	 * @param {object} stream
	 * @param {boolean} suppress
	 * @public
	 */

	function destroy (stream, suppress) {
	  if (isFsReadStream(stream)) {
	    destroyReadStream(stream);
	  } else if (isZlibStream(stream)) {
	    destroyZlibStream(stream);
	  } else if (hasDestroy(stream)) {
	    stream.destroy();
	  }

	  if (isEventEmitter(stream) && suppress) {
	    stream.removeAllListeners('error');
	    stream.addListener('error', noop);
	  }

	  return stream
	}

	/**
	 * Destroy a ReadStream.
	 *
	 * @param {object} stream
	 * @private
	 */

	function destroyReadStream (stream) {
	  stream.destroy();

	  if (typeof stream.close === 'function') {
	    // node.js core bug work-around
	    stream.on('open', onOpenClose);
	  }
	}

	/**
	 * Close a Zlib stream.
	 *
	 * Zlib streams below Node.js 4.5.5 have a buggy implementation
	 * of .close() when zlib encountered an error.
	 *
	 * @param {object} stream
	 * @private
	 */

	function closeZlibStream (stream) {
	  if (stream._hadError === true) {
	    var prop = stream._binding === null
	      ? '_binding'
	      : '_handle';

	    stream[prop] = {
	      close: function () { this[prop] = null; }
	    };
	  }

	  stream.close();
	}

	/**
	 * Destroy a Zlib stream.
	 *
	 * Zlib streams don't have a destroy function in Node.js 6. On top of that
	 * simply calling destroy on a zlib stream in Node.js 8+ will result in a
	 * memory leak. So until that is fixed, we need to call both close AND destroy.
	 *
	 * PR to fix memory leak: https://github.com/nodejs/node/pull/23734
	 *
	 * In Node.js 6+8, it's important that destroy is called before close as the
	 * stream would otherwise emit the error 'zlib binding closed'.
	 *
	 * @param {object} stream
	 * @private
	 */

	function destroyZlibStream (stream) {
	  if (typeof stream.destroy === 'function') {
	    // node.js core bug work-around
	    // istanbul ignore if: node.js 0.8
	    if (stream._binding) {
	      // node.js < 0.10.0
	      stream.destroy();
	      if (stream._processing) {
	        stream._needDrain = true;
	        stream.once('drain', onDrainClearBinding);
	      } else {
	        stream._binding.clear();
	      }
	    } else if (stream._destroy && stream._destroy !== Stream.Transform.prototype._destroy) {
	      // node.js >= 12, ^11.1.0, ^10.15.1
	      stream.destroy();
	    } else if (stream._destroy && typeof stream.close === 'function') {
	      // node.js 7, 8
	      stream.destroyed = true;
	      stream.close();
	    } else {
	      // fallback
	      // istanbul ignore next
	      stream.destroy();
	    }
	  } else if (typeof stream.close === 'function') {
	    // node.js < 8 fallback
	    closeZlibStream(stream);
	  }
	}

	/**
	 * Determine if stream has destroy.
	 * @private
	 */

	function hasDestroy (stream) {
	  return stream instanceof Stream &&
	    typeof stream.destroy === 'function'
	}

	/**
	 * Determine if val is EventEmitter.
	 * @private
	 */

	function isEventEmitter (val) {
	  return val instanceof EventEmitter
	}

	/**
	 * Determine if stream is fs.ReadStream stream.
	 * @private
	 */

	function isFsReadStream (stream) {
	  return stream instanceof ReadStream
	}

	/**
	 * Determine if stream is Zlib stream.
	 * @private
	 */

	function isZlibStream (stream) {
	  return stream instanceof Zlib.Gzip ||
	    stream instanceof Zlib.Gunzip ||
	    stream instanceof Zlib.Deflate ||
	    stream instanceof Zlib.DeflateRaw ||
	    stream instanceof Zlib.Inflate ||
	    stream instanceof Zlib.InflateRaw ||
	    stream instanceof Zlib.Unzip
	}

	/**
	 * No-op function.
	 * @private
	 */

	function noop () {}

	/**
	 * On drain handler to clear binding.
	 * @private
	 */

	// istanbul ignore next: node.js 0.8
	function onDrainClearBinding () {
	  this._binding.clear();
	}

	/**
	 * On open handler to close stream.
	 * @private
	 */

	function onOpenClose () {
	  if (typeof this.fd === 'number') {
	    // actually close down the fd
	    this.close();
	  }
	}
	return destroy_1;
}

/*!
 * encodeurl
 * Copyright(c) 2016 Douglas Christopher Wilson
 * MIT Licensed
 */

var encodeurl;
var hasRequiredEncodeurl;

function requireEncodeurl () {
	if (hasRequiredEncodeurl) return encodeurl;
	hasRequiredEncodeurl = 1;

	/**
	 * Module exports.
	 * @public
	 */

	encodeurl = encodeUrl;

	/**
	 * RegExp to match non-URL code points, *after* encoding (i.e. not including "%")
	 * and including invalid escape sequences.
	 * @private
	 */

	var ENCODE_CHARS_REGEXP = /(?:[^\x21\x25\x26-\x3B\x3D\x3F-\x5B\x5D\x5F\x61-\x7A\x7E]|%(?:[^0-9A-Fa-f]|[0-9A-Fa-f][^0-9A-Fa-f]|$))+/g;

	/**
	 * RegExp to match unmatched surrogate pair.
	 * @private
	 */

	var UNMATCHED_SURROGATE_PAIR_REGEXP = /(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF]([^\uDC00-\uDFFF]|$)/g;

	/**
	 * String to replace unmatched surrogate pair with.
	 * @private
	 */

	var UNMATCHED_SURROGATE_PAIR_REPLACE = '$1\uFFFD$2';

	/**
	 * Encode a URL to a percent-encoded form, excluding already-encoded sequences.
	 *
	 * This function will take an already-encoded URL and encode all the non-URL
	 * code points. This function will not encode the "%" character unless it is
	 * not part of a valid sequence (`%20` will be left as-is, but `%foo` will
	 * be encoded as `%25foo`).
	 *
	 * This encode is meant to be "safe" and does not throw errors. It will try as
	 * hard as it can to properly encode the given URL, including replacing any raw,
	 * unpaired surrogate pairs with the Unicode replacement character prior to
	 * encoding.
	 *
	 * @param {string} url
	 * @return {string}
	 * @public
	 */

	function encodeUrl (url) {
	  return String(url)
	    .replace(UNMATCHED_SURROGATE_PAIR_REGEXP, UNMATCHED_SURROGATE_PAIR_REPLACE)
	    .replace(ENCODE_CHARS_REGEXP, encodeURI)
	}
	return encodeurl;
}

const require$$0 = /*@__PURE__*/getAugmentedNamespace(crypto);

/*!
 * etag
 * Copyright(c) 2014-2016 Douglas Christopher Wilson
 * MIT Licensed
 */

var etag_1;
var hasRequiredEtag;

function requireEtag () {
	if (hasRequiredEtag) return etag_1;
	hasRequiredEtag = 1;

	/**
	 * Module exports.
	 * @public
	 */

	etag_1 = etag;

	/**
	 * Module dependencies.
	 * @private
	 */

	var crypto = require$$0;
	var Stats = require$$8.Stats;

	/**
	 * Module variables.
	 * @private
	 */

	var toString = Object.prototype.toString;

	/**
	 * Generate an entity tag.
	 *
	 * @param {Buffer|string} entity
	 * @return {string}
	 * @private
	 */

	function entitytag (entity) {
	  if (entity.length === 0) {
	    // fast-path empty
	    return '"0-2jmj7l5rSw0yVb/vlWAYkK/YBwk"'
	  }

	  // compute hash of entity
	  var hash = crypto
	    .createHash('sha1')
	    .update(entity, 'utf8')
	    .digest('base64')
	    .substring(0, 27);

	  // compute length of entity
	  var len = typeof entity === 'string'
	    ? Buffer.byteLength(entity, 'utf8')
	    : entity.length;

	  return '"' + len.toString(16) + '-' + hash + '"'
	}

	/**
	 * Create a simple ETag.
	 *
	 * @param {string|Buffer|Stats} entity
	 * @param {object} [options]
	 * @param {boolean} [options.weak]
	 * @return {String}
	 * @public
	 */

	function etag (entity, options) {
	  if (entity == null) {
	    throw new TypeError('argument entity is required')
	  }

	  // support fs.Stats object
	  var isStats = isstats(entity);
	  var weak = options && typeof options.weak === 'boolean'
	    ? options.weak
	    : isStats;

	  // validate argument
	  if (!isStats && typeof entity !== 'string' && !Buffer.isBuffer(entity)) {
	    throw new TypeError('argument entity must be string, Buffer, or fs.Stats')
	  }

	  // generate entity tag
	  var tag = isStats
	    ? stattag(entity)
	    : entitytag(entity);

	  return weak
	    ? 'W/' + tag
	    : tag
	}

	/**
	 * Determine if object is a Stats object.
	 *
	 * @param {object} obj
	 * @return {boolean}
	 * @api private
	 */

	function isstats (obj) {
	  // genuine fs.Stats
	  if (typeof Stats === 'function' && obj instanceof Stats) {
	    return true
	  }

	  // quack quack
	  return obj && typeof obj === 'object' &&
	    'ctime' in obj && toString.call(obj.ctime) === '[object Date]' &&
	    'mtime' in obj && toString.call(obj.mtime) === '[object Date]' &&
	    'ino' in obj && typeof obj.ino === 'number' &&
	    'size' in obj && typeof obj.size === 'number'
	}

	/**
	 * Generate a tag for a stat.
	 *
	 * @param {object} stat
	 * @return {string}
	 * @private
	 */

	function stattag (stat) {
	  var mtime = stat.mtime.getTime().toString(16);
	  var size = stat.size.toString(16);

	  return '"' + size + '-' + mtime + '"'
	}
	return etag_1;
}

/*!
 * fresh
 * Copyright(c) 2012 TJ Holowaychuk
 * Copyright(c) 2016-2017 Douglas Christopher Wilson
 * MIT Licensed
 */

var fresh_1;
var hasRequiredFresh;

function requireFresh () {
	if (hasRequiredFresh) return fresh_1;
	hasRequiredFresh = 1;

	/**
	 * RegExp to check for no-cache token in Cache-Control.
	 * @private
	 */

	var CACHE_CONTROL_NO_CACHE_REGEXP = /(?:^|,)\s*?no-cache\s*?(?:,|$)/;

	/**
	 * Module exports.
	 * @public
	 */

	fresh_1 = fresh;

	/**
	 * Check freshness of the response using request and response headers.
	 *
	 * @param {Object} reqHeaders
	 * @param {Object} resHeaders
	 * @return {Boolean}
	 * @public
	 */

	function fresh (reqHeaders, resHeaders) {
	  // fields
	  var modifiedSince = reqHeaders['if-modified-since'];
	  var noneMatch = reqHeaders['if-none-match'];

	  // unconditional request
	  if (!modifiedSince && !noneMatch) {
	    return false
	  }

	  // Always return stale when Cache-Control: no-cache
	  // to support end-to-end reload requests
	  // https://tools.ietf.org/html/rfc2616#section-14.9.4
	  var cacheControl = reqHeaders['cache-control'];
	  if (cacheControl && CACHE_CONTROL_NO_CACHE_REGEXP.test(cacheControl)) {
	    return false
	  }

	  // if-none-match
	  if (noneMatch && noneMatch !== '*') {
	    var etag = resHeaders['etag'];

	    if (!etag) {
	      return false
	    }

	    var etagStale = true;
	    var matches = parseTokenList(noneMatch);
	    for (var i = 0; i < matches.length; i++) {
	      var match = matches[i];
	      if (match === etag || match === 'W/' + etag || 'W/' + match === etag) {
	        etagStale = false;
	        break
	      }
	    }

	    if (etagStale) {
	      return false
	    }
	  }

	  // if-modified-since
	  if (modifiedSince) {
	    var lastModified = resHeaders['last-modified'];
	    var modifiedStale = !lastModified || !(parseHttpDate(lastModified) <= parseHttpDate(modifiedSince));

	    if (modifiedStale) {
	      return false
	    }
	  }

	  return true
	}

	/**
	 * Parse an HTTP Date into a number.
	 *
	 * @param {string} date
	 * @private
	 */

	function parseHttpDate (date) {
	  var timestamp = date && Date.parse(date);

	  // istanbul ignore next: guard against date.js Date.parse patching
	  return typeof timestamp === 'number'
	    ? timestamp
	    : NaN
	}

	/**
	 * Parse a HTTP token list.
	 *
	 * @param {string} str
	 * @private
	 */

	function parseTokenList (str) {
	  var end = 0;
	  var list = [];
	  var start = 0;

	  // gather tokens
	  for (var i = 0, len = str.length; i < len; i++) {
	    switch (str.charCodeAt(i)) {
	      case 0x20: /*   */
	        if (start === end) {
	          start = end = i + 1;
	        }
	        break
	      case 0x2c: /* , */
	        list.push(str.substring(start, end));
	        start = end = i + 1;
	        break
	      default:
	        end = i + 1;
	        break
	    }
	  }

	  // final token
	  list.push(str.substring(start, end));

	  return list
	}
	return fresh_1;
}

const require$$2 = {
  "application/andrew-inset": ["ez"],
  "application/applixware": ["aw"],
  "application/atom+xml": ["atom"],
  "application/atomcat+xml": ["atomcat"],
  "application/atomsvc+xml": ["atomsvc"],
  "application/bdoc": ["bdoc"],
  "application/ccxml+xml": ["ccxml"],
  "application/cdmi-capability": ["cdmia"],
  "application/cdmi-container": ["cdmic"],
  "application/cdmi-domain": ["cdmid"],
  "application/cdmi-object": ["cdmio"],
  "application/cdmi-queue": ["cdmiq"],
  "application/cu-seeme": ["cu"],
  "application/dash+xml": ["mpd"],
  "application/davmount+xml": ["davmount"],
  "application/docbook+xml": ["dbk"],
  "application/dssc+der": ["dssc"],
  "application/dssc+xml": ["xdssc"],
  "application/ecmascript": ["ecma"],
  "application/emma+xml": ["emma"],
  "application/epub+zip": ["epub"],
  "application/exi": ["exi"],
  "application/font-tdpfr": ["pfr"],
  "application/font-woff": [],
  "application/font-woff2": [],
  "application/geo+json": ["geojson"],
  "application/gml+xml": ["gml"],
  "application/gpx+xml": ["gpx"],
  "application/gxf": ["gxf"],
  "application/gzip": ["gz"],
  "application/hyperstudio": ["stk"],
  "application/inkml+xml": ["ink","inkml"],
  "application/ipfix": ["ipfix"],
  "application/java-archive": ["jar","war","ear"],
  "application/java-serialized-object": ["ser"],
  "application/java-vm": ["class"],
  "application/javascript": ["js","mjs"],
  "application/json": ["json","map"],
  "application/json5": ["json5"],
  "application/jsonml+json": ["jsonml"],
  "application/ld+json": ["jsonld"],
  "application/lost+xml": ["lostxml"],
  "application/mac-binhex40": ["hqx"],
  "application/mac-compactpro": ["cpt"],
  "application/mads+xml": ["mads"],
  "application/manifest+json": ["webmanifest"],
  "application/marc": ["mrc"],
  "application/marcxml+xml": ["mrcx"],
  "application/mathematica": ["ma","nb","mb"],
  "application/mathml+xml": ["mathml"],
  "application/mbox": ["mbox"],
  "application/mediaservercontrol+xml": ["mscml"],
  "application/metalink+xml": ["metalink"],
  "application/metalink4+xml": ["meta4"],
  "application/mets+xml": ["mets"],
  "application/mods+xml": ["mods"],
  "application/mp21": ["m21","mp21"],
  "application/mp4": ["mp4s","m4p"],
  "application/msword": ["doc","dot"],
  "application/mxf": ["mxf"],
  "application/octet-stream": ["bin","dms","lrf","mar","so","dist","distz","pkg","bpk","dump","elc","deploy","exe","dll","deb","dmg","iso","img","msi","msp","msm","buffer"],
  "application/oda": ["oda"],
  "application/oebps-package+xml": ["opf"],
  "application/ogg": ["ogx"],
  "application/omdoc+xml": ["omdoc"],
  "application/onenote": ["onetoc","onetoc2","onetmp","onepkg"],
  "application/oxps": ["oxps"],
  "application/patch-ops-error+xml": ["xer"],
  "application/pdf": ["pdf"],
  "application/pgp-encrypted": ["pgp"],
  "application/pgp-signature": ["asc","sig"],
  "application/pics-rules": ["prf"],
  "application/pkcs10": ["p10"],
  "application/pkcs7-mime": ["p7m","p7c"],
  "application/pkcs7-signature": ["p7s"],
  "application/pkcs8": ["p8"],
  "application/pkix-attr-cert": ["ac"],
  "application/pkix-cert": ["cer"],
  "application/pkix-crl": ["crl"],
  "application/pkix-pkipath": ["pkipath"],
  "application/pkixcmp": ["pki"],
  "application/pls+xml": ["pls"],
  "application/postscript": ["ai","eps","ps"],
  "application/prs.cww": ["cww"],
  "application/pskc+xml": ["pskcxml"],
  "application/raml+yaml": ["raml"],
  "application/rdf+xml": ["rdf"],
  "application/reginfo+xml": ["rif"],
  "application/relax-ng-compact-syntax": ["rnc"],
  "application/resource-lists+xml": ["rl"],
  "application/resource-lists-diff+xml": ["rld"],
  "application/rls-services+xml": ["rs"],
  "application/rpki-ghostbusters": ["gbr"],
  "application/rpki-manifest": ["mft"],
  "application/rpki-roa": ["roa"],
  "application/rsd+xml": ["rsd"],
  "application/rss+xml": ["rss"],
  "application/rtf": ["rtf"],
  "application/sbml+xml": ["sbml"],
  "application/scvp-cv-request": ["scq"],
  "application/scvp-cv-response": ["scs"],
  "application/scvp-vp-request": ["spq"],
  "application/scvp-vp-response": ["spp"],
  "application/sdp": ["sdp"],
  "application/set-payment-initiation": ["setpay"],
  "application/set-registration-initiation": ["setreg"],
  "application/shf+xml": ["shf"],
  "application/smil+xml": ["smi","smil"],
  "application/sparql-query": ["rq"],
  "application/sparql-results+xml": ["srx"],
  "application/srgs": ["gram"],
  "application/srgs+xml": ["grxml"],
  "application/sru+xml": ["sru"],
  "application/ssdl+xml": ["ssdl"],
  "application/ssml+xml": ["ssml"],
  "application/tei+xml": ["tei","teicorpus"],
  "application/thraud+xml": ["tfi"],
  "application/timestamped-data": ["tsd"],
  "application/vnd.3gpp.pic-bw-large": ["plb"],
  "application/vnd.3gpp.pic-bw-small": ["psb"],
  "application/vnd.3gpp.pic-bw-var": ["pvb"],
  "application/vnd.3gpp2.tcap": ["tcap"],
  "application/vnd.3m.post-it-notes": ["pwn"],
  "application/vnd.accpac.simply.aso": ["aso"],
  "application/vnd.accpac.simply.imp": ["imp"],
  "application/vnd.acucobol": ["acu"],
  "application/vnd.acucorp": ["atc","acutc"],
  "application/vnd.adobe.air-application-installer-package+zip": ["air"],
  "application/vnd.adobe.formscentral.fcdt": ["fcdt"],
  "application/vnd.adobe.fxp": ["fxp","fxpl"],
  "application/vnd.adobe.xdp+xml": ["xdp"],
  "application/vnd.adobe.xfdf": ["xfdf"],
  "application/vnd.ahead.space": ["ahead"],
  "application/vnd.airzip.filesecure.azf": ["azf"],
  "application/vnd.airzip.filesecure.azs": ["azs"],
  "application/vnd.amazon.ebook": ["azw"],
  "application/vnd.americandynamics.acc": ["acc"],
  "application/vnd.amiga.ami": ["ami"],
  "application/vnd.android.package-archive": ["apk"],
  "application/vnd.anser-web-certificate-issue-initiation": ["cii"],
  "application/vnd.anser-web-funds-transfer-initiation": ["fti"],
  "application/vnd.antix.game-component": ["atx"],
  "application/vnd.apple.installer+xml": ["mpkg"],
  "application/vnd.apple.mpegurl": ["m3u8"],
  "application/vnd.apple.pkpass": ["pkpass"],
  "application/vnd.aristanetworks.swi": ["swi"],
  "application/vnd.astraea-software.iota": ["iota"],
  "application/vnd.audiograph": ["aep"],
  "application/vnd.blueice.multipass": ["mpm"],
  "application/vnd.bmi": ["bmi"],
  "application/vnd.businessobjects": ["rep"],
  "application/vnd.chemdraw+xml": ["cdxml"],
  "application/vnd.chipnuts.karaoke-mmd": ["mmd"],
  "application/vnd.cinderella": ["cdy"],
  "application/vnd.claymore": ["cla"],
  "application/vnd.cloanto.rp9": ["rp9"],
  "application/vnd.clonk.c4group": ["c4g","c4d","c4f","c4p","c4u"],
  "application/vnd.cluetrust.cartomobile-config": ["c11amc"],
  "application/vnd.cluetrust.cartomobile-config-pkg": ["c11amz"],
  "application/vnd.commonspace": ["csp"],
  "application/vnd.contact.cmsg": ["cdbcmsg"],
  "application/vnd.cosmocaller": ["cmc"],
  "application/vnd.crick.clicker": ["clkx"],
  "application/vnd.crick.clicker.keyboard": ["clkk"],
  "application/vnd.crick.clicker.palette": ["clkp"],
  "application/vnd.crick.clicker.template": ["clkt"],
  "application/vnd.crick.clicker.wordbank": ["clkw"],
  "application/vnd.criticaltools.wbs+xml": ["wbs"],
  "application/vnd.ctc-posml": ["pml"],
  "application/vnd.cups-ppd": ["ppd"],
  "application/vnd.curl.car": ["car"],
  "application/vnd.curl.pcurl": ["pcurl"],
  "application/vnd.dart": ["dart"],
  "application/vnd.data-vision.rdz": ["rdz"],
  "application/vnd.dece.data": ["uvf","uvvf","uvd","uvvd"],
  "application/vnd.dece.ttml+xml": ["uvt","uvvt"],
  "application/vnd.dece.unspecified": ["uvx","uvvx"],
  "application/vnd.dece.zip": ["uvz","uvvz"],
  "application/vnd.denovo.fcselayout-link": ["fe_launch"],
  "application/vnd.dna": ["dna"],
  "application/vnd.dolby.mlp": ["mlp"],
  "application/vnd.dpgraph": ["dpg"],
  "application/vnd.dreamfactory": ["dfac"],
  "application/vnd.ds-keypoint": ["kpxx"],
  "application/vnd.dvb.ait": ["ait"],
  "application/vnd.dvb.service": ["svc"],
  "application/vnd.dynageo": ["geo"],
  "application/vnd.ecowin.chart": ["mag"],
  "application/vnd.enliven": ["nml"],
  "application/vnd.epson.esf": ["esf"],
  "application/vnd.epson.msf": ["msf"],
  "application/vnd.epson.quickanime": ["qam"],
  "application/vnd.epson.salt": ["slt"],
  "application/vnd.epson.ssf": ["ssf"],
  "application/vnd.eszigno3+xml": ["es3","et3"],
  "application/vnd.ezpix-album": ["ez2"],
  "application/vnd.ezpix-package": ["ez3"],
  "application/vnd.fdf": ["fdf"],
  "application/vnd.fdsn.mseed": ["mseed"],
  "application/vnd.fdsn.seed": ["seed","dataless"],
  "application/vnd.flographit": ["gph"],
  "application/vnd.fluxtime.clip": ["ftc"],
  "application/vnd.framemaker": ["fm","frame","maker","book"],
  "application/vnd.frogans.fnc": ["fnc"],
  "application/vnd.frogans.ltf": ["ltf"],
  "application/vnd.fsc.weblaunch": ["fsc"],
  "application/vnd.fujitsu.oasys": ["oas"],
  "application/vnd.fujitsu.oasys2": ["oa2"],
  "application/vnd.fujitsu.oasys3": ["oa3"],
  "application/vnd.fujitsu.oasysgp": ["fg5"],
  "application/vnd.fujitsu.oasysprs": ["bh2"],
  "application/vnd.fujixerox.ddd": ["ddd"],
  "application/vnd.fujixerox.docuworks": ["xdw"],
  "application/vnd.fujixerox.docuworks.binder": ["xbd"],
  "application/vnd.fuzzysheet": ["fzs"],
  "application/vnd.genomatix.tuxedo": ["txd"],
  "application/vnd.geogebra.file": ["ggb"],
  "application/vnd.geogebra.tool": ["ggt"],
  "application/vnd.geometry-explorer": ["gex","gre"],
  "application/vnd.geonext": ["gxt"],
  "application/vnd.geoplan": ["g2w"],
  "application/vnd.geospace": ["g3w"],
  "application/vnd.gmx": ["gmx"],
  "application/vnd.google-apps.document": ["gdoc"],
  "application/vnd.google-apps.presentation": ["gslides"],
  "application/vnd.google-apps.spreadsheet": ["gsheet"],
  "application/vnd.google-earth.kml+xml": ["kml"],
  "application/vnd.google-earth.kmz": ["kmz"],
  "application/vnd.grafeq": ["gqf","gqs"],
  "application/vnd.groove-account": ["gac"],
  "application/vnd.groove-help": ["ghf"],
  "application/vnd.groove-identity-message": ["gim"],
  "application/vnd.groove-injector": ["grv"],
  "application/vnd.groove-tool-message": ["gtm"],
  "application/vnd.groove-tool-template": ["tpl"],
  "application/vnd.groove-vcard": ["vcg"],
  "application/vnd.hal+xml": ["hal"],
  "application/vnd.handheld-entertainment+xml": ["zmm"],
  "application/vnd.hbci": ["hbci"],
  "application/vnd.hhe.lesson-player": ["les"],
  "application/vnd.hp-hpgl": ["hpgl"],
  "application/vnd.hp-hpid": ["hpid"],
  "application/vnd.hp-hps": ["hps"],
  "application/vnd.hp-jlyt": ["jlt"],
  "application/vnd.hp-pcl": ["pcl"],
  "application/vnd.hp-pclxl": ["pclxl"],
  "application/vnd.hydrostatix.sof-data": ["sfd-hdstx"],
  "application/vnd.ibm.minipay": ["mpy"],
  "application/vnd.ibm.modcap": ["afp","listafp","list3820"],
  "application/vnd.ibm.rights-management": ["irm"],
  "application/vnd.ibm.secure-container": ["sc"],
  "application/vnd.iccprofile": ["icc","icm"],
  "application/vnd.igloader": ["igl"],
  "application/vnd.immervision-ivp": ["ivp"],
  "application/vnd.immervision-ivu": ["ivu"],
  "application/vnd.insors.igm": ["igm"],
  "application/vnd.intercon.formnet": ["xpw","xpx"],
  "application/vnd.intergeo": ["i2g"],
  "application/vnd.intu.qbo": ["qbo"],
  "application/vnd.intu.qfx": ["qfx"],
  "application/vnd.ipunplugged.rcprofile": ["rcprofile"],
  "application/vnd.irepository.package+xml": ["irp"],
  "application/vnd.is-xpr": ["xpr"],
  "application/vnd.isac.fcs": ["fcs"],
  "application/vnd.jam": ["jam"],
  "application/vnd.jcp.javame.midlet-rms": ["rms"],
  "application/vnd.jisp": ["jisp"],
  "application/vnd.joost.joda-archive": ["joda"],
  "application/vnd.kahootz": ["ktz","ktr"],
  "application/vnd.kde.karbon": ["karbon"],
  "application/vnd.kde.kchart": ["chrt"],
  "application/vnd.kde.kformula": ["kfo"],
  "application/vnd.kde.kivio": ["flw"],
  "application/vnd.kde.kontour": ["kon"],
  "application/vnd.kde.kpresenter": ["kpr","kpt"],
  "application/vnd.kde.kspread": ["ksp"],
  "application/vnd.kde.kword": ["kwd","kwt"],
  "application/vnd.kenameaapp": ["htke"],
  "application/vnd.kidspiration": ["kia"],
  "application/vnd.kinar": ["kne","knp"],
  "application/vnd.koan": ["skp","skd","skt","skm"],
  "application/vnd.kodak-descriptor": ["sse"],
  "application/vnd.las.las+xml": ["lasxml"],
  "application/vnd.llamagraphics.life-balance.desktop": ["lbd"],
  "application/vnd.llamagraphics.life-balance.exchange+xml": ["lbe"],
  "application/vnd.lotus-1-2-3": ["123"],
  "application/vnd.lotus-approach": ["apr"],
  "application/vnd.lotus-freelance": ["pre"],
  "application/vnd.lotus-notes": ["nsf"],
  "application/vnd.lotus-organizer": ["org"],
  "application/vnd.lotus-screencam": ["scm"],
  "application/vnd.lotus-wordpro": ["lwp"],
  "application/vnd.macports.portpkg": ["portpkg"],
  "application/vnd.mcd": ["mcd"],
  "application/vnd.medcalcdata": ["mc1"],
  "application/vnd.mediastation.cdkey": ["cdkey"],
  "application/vnd.mfer": ["mwf"],
  "application/vnd.mfmp": ["mfm"],
  "application/vnd.micrografx.flo": ["flo"],
  "application/vnd.micrografx.igx": ["igx"],
  "application/vnd.mif": ["mif"],
  "application/vnd.mobius.daf": ["daf"],
  "application/vnd.mobius.dis": ["dis"],
  "application/vnd.mobius.mbk": ["mbk"],
  "application/vnd.mobius.mqy": ["mqy"],
  "application/vnd.mobius.msl": ["msl"],
  "application/vnd.mobius.plc": ["plc"],
  "application/vnd.mobius.txf": ["txf"],
  "application/vnd.mophun.application": ["mpn"],
  "application/vnd.mophun.certificate": ["mpc"],
  "application/vnd.mozilla.xul+xml": ["xul"],
  "application/vnd.ms-artgalry": ["cil"],
  "application/vnd.ms-cab-compressed": ["cab"],
  "application/vnd.ms-excel": ["xls","xlm","xla","xlc","xlt","xlw"],
  "application/vnd.ms-excel.addin.macroenabled.12": ["xlam"],
  "application/vnd.ms-excel.sheet.binary.macroenabled.12": ["xlsb"],
  "application/vnd.ms-excel.sheet.macroenabled.12": ["xlsm"],
  "application/vnd.ms-excel.template.macroenabled.12": ["xltm"],
  "application/vnd.ms-fontobject": ["eot"],
  "application/vnd.ms-htmlhelp": ["chm"],
  "application/vnd.ms-ims": ["ims"],
  "application/vnd.ms-lrm": ["lrm"],
  "application/vnd.ms-officetheme": ["thmx"],
  "application/vnd.ms-outlook": ["msg"],
  "application/vnd.ms-pki.seccat": ["cat"],
  "application/vnd.ms-pki.stl": ["stl"],
  "application/vnd.ms-powerpoint": ["ppt","pps","pot"],
  "application/vnd.ms-powerpoint.addin.macroenabled.12": ["ppam"],
  "application/vnd.ms-powerpoint.presentation.macroenabled.12": ["pptm"],
  "application/vnd.ms-powerpoint.slide.macroenabled.12": ["sldm"],
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12": ["ppsm"],
  "application/vnd.ms-powerpoint.template.macroenabled.12": ["potm"],
  "application/vnd.ms-project": ["mpp","mpt"],
  "application/vnd.ms-word.document.macroenabled.12": ["docm"],
  "application/vnd.ms-word.template.macroenabled.12": ["dotm"],
  "application/vnd.ms-works": ["wps","wks","wcm","wdb"],
  "application/vnd.ms-wpl": ["wpl"],
  "application/vnd.ms-xpsdocument": ["xps"],
  "application/vnd.mseq": ["mseq"],
  "application/vnd.musician": ["mus"],
  "application/vnd.muvee.style": ["msty"],
  "application/vnd.mynfc": ["taglet"],
  "application/vnd.neurolanguage.nlu": ["nlu"],
  "application/vnd.nitf": ["ntf","nitf"],
  "application/vnd.noblenet-directory": ["nnd"],
  "application/vnd.noblenet-sealer": ["nns"],
  "application/vnd.noblenet-web": ["nnw"],
  "application/vnd.nokia.n-gage.data": ["ngdat"],
  "application/vnd.nokia.n-gage.symbian.install": ["n-gage"],
  "application/vnd.nokia.radio-preset": ["rpst"],
  "application/vnd.nokia.radio-presets": ["rpss"],
  "application/vnd.novadigm.edm": ["edm"],
  "application/vnd.novadigm.edx": ["edx"],
  "application/vnd.novadigm.ext": ["ext"],
  "application/vnd.oasis.opendocument.chart": ["odc"],
  "application/vnd.oasis.opendocument.chart-template": ["otc"],
  "application/vnd.oasis.opendocument.database": ["odb"],
  "application/vnd.oasis.opendocument.formula": ["odf"],
  "application/vnd.oasis.opendocument.formula-template": ["odft"],
  "application/vnd.oasis.opendocument.graphics": ["odg"],
  "application/vnd.oasis.opendocument.graphics-template": ["otg"],
  "application/vnd.oasis.opendocument.image": ["odi"],
  "application/vnd.oasis.opendocument.image-template": ["oti"],
  "application/vnd.oasis.opendocument.presentation": ["odp"],
  "application/vnd.oasis.opendocument.presentation-template": ["otp"],
  "application/vnd.oasis.opendocument.spreadsheet": ["ods"],
  "application/vnd.oasis.opendocument.spreadsheet-template": ["ots"],
  "application/vnd.oasis.opendocument.text": ["odt"],
  "application/vnd.oasis.opendocument.text-master": ["odm"],
  "application/vnd.oasis.opendocument.text-template": ["ott"],
  "application/vnd.oasis.opendocument.text-web": ["oth"],
  "application/vnd.olpc-sugar": ["xo"],
  "application/vnd.oma.dd2+xml": ["dd2"],
  "application/vnd.openofficeorg.extension": ["oxt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "application/vnd.openxmlformats-officedocument.presentationml.slide": ["sldx"],
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow": ["ppsx"],
  "application/vnd.openxmlformats-officedocument.presentationml.template": ["potx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template": ["xltx"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template": ["dotx"],
  "application/vnd.osgeo.mapguide.package": ["mgp"],
  "application/vnd.osgi.dp": ["dp"],
  "application/vnd.osgi.subsystem": ["esa"],
  "application/vnd.palm": ["pdb","pqa","oprc"],
  "application/vnd.pawaafile": ["paw"],
  "application/vnd.pg.format": ["str"],
  "application/vnd.pg.osasli": ["ei6"],
  "application/vnd.picsel": ["efif"],
  "application/vnd.pmi.widget": ["wg"],
  "application/vnd.pocketlearn": ["plf"],
  "application/vnd.powerbuilder6": ["pbd"],
  "application/vnd.previewsystems.box": ["box"],
  "application/vnd.proteus.magazine": ["mgz"],
  "application/vnd.publishare-delta-tree": ["qps"],
  "application/vnd.pvi.ptid1": ["ptid"],
  "application/vnd.quark.quarkxpress": ["qxd","qxt","qwd","qwt","qxl","qxb"],
  "application/vnd.realvnc.bed": ["bed"],
  "application/vnd.recordare.musicxml": ["mxl"],
  "application/vnd.recordare.musicxml+xml": ["musicxml"],
  "application/vnd.rig.cryptonote": ["cryptonote"],
  "application/vnd.rim.cod": ["cod"],
  "application/vnd.rn-realmedia": ["rm"],
  "application/vnd.rn-realmedia-vbr": ["rmvb"],
  "application/vnd.route66.link66+xml": ["link66"],
  "application/vnd.sailingtracker.track": ["st"],
  "application/vnd.seemail": ["see"],
  "application/vnd.sema": ["sema"],
  "application/vnd.semd": ["semd"],
  "application/vnd.semf": ["semf"],
  "application/vnd.shana.informed.formdata": ["ifm"],
  "application/vnd.shana.informed.formtemplate": ["itp"],
  "application/vnd.shana.informed.interchange": ["iif"],
  "application/vnd.shana.informed.package": ["ipk"],
  "application/vnd.simtech-mindmapper": ["twd","twds"],
  "application/vnd.smaf": ["mmf"],
  "application/vnd.smart.teacher": ["teacher"],
  "application/vnd.solent.sdkm+xml": ["sdkm","sdkd"],
  "application/vnd.spotfire.dxp": ["dxp"],
  "application/vnd.spotfire.sfs": ["sfs"],
  "application/vnd.stardivision.calc": ["sdc"],
  "application/vnd.stardivision.draw": ["sda"],
  "application/vnd.stardivision.impress": ["sdd"],
  "application/vnd.stardivision.math": ["smf"],
  "application/vnd.stardivision.writer": ["sdw","vor"],
  "application/vnd.stardivision.writer-global": ["sgl"],
  "application/vnd.stepmania.package": ["smzip"],
  "application/vnd.stepmania.stepchart": ["sm"],
  "application/vnd.sun.wadl+xml": ["wadl"],
  "application/vnd.sun.xml.calc": ["sxc"],
  "application/vnd.sun.xml.calc.template": ["stc"],
  "application/vnd.sun.xml.draw": ["sxd"],
  "application/vnd.sun.xml.draw.template": ["std"],
  "application/vnd.sun.xml.impress": ["sxi"],
  "application/vnd.sun.xml.impress.template": ["sti"],
  "application/vnd.sun.xml.math": ["sxm"],
  "application/vnd.sun.xml.writer": ["sxw"],
  "application/vnd.sun.xml.writer.global": ["sxg"],
  "application/vnd.sun.xml.writer.template": ["stw"],
  "application/vnd.sus-calendar": ["sus","susp"],
  "application/vnd.svd": ["svd"],
  "application/vnd.symbian.install": ["sis","sisx"],
  "application/vnd.syncml+xml": ["xsm"],
  "application/vnd.syncml.dm+wbxml": ["bdm"],
  "application/vnd.syncml.dm+xml": ["xdm"],
  "application/vnd.tao.intent-module-archive": ["tao"],
  "application/vnd.tcpdump.pcap": ["pcap","cap","dmp"],
  "application/vnd.tmobile-livetv": ["tmo"],
  "application/vnd.trid.tpt": ["tpt"],
  "application/vnd.triscape.mxs": ["mxs"],
  "application/vnd.trueapp": ["tra"],
  "application/vnd.ufdl": ["ufd","ufdl"],
  "application/vnd.uiq.theme": ["utz"],
  "application/vnd.umajin": ["umj"],
  "application/vnd.unity": ["unityweb"],
  "application/vnd.uoml+xml": ["uoml"],
  "application/vnd.vcx": ["vcx"],
  "application/vnd.visio": ["vsd","vst","vss","vsw"],
  "application/vnd.visionary": ["vis"],
  "application/vnd.vsf": ["vsf"],
  "application/vnd.wap.wbxml": ["wbxml"],
  "application/vnd.wap.wmlc": ["wmlc"],
  "application/vnd.wap.wmlscriptc": ["wmlsc"],
  "application/vnd.webturbo": ["wtb"],
  "application/vnd.wolfram.player": ["nbp"],
  "application/vnd.wordperfect": ["wpd"],
  "application/vnd.wqd": ["wqd"],
  "application/vnd.wt.stf": ["stf"],
  "application/vnd.xara": ["xar"],
  "application/vnd.xfdl": ["xfdl"],
  "application/vnd.yamaha.hv-dic": ["hvd"],
  "application/vnd.yamaha.hv-script": ["hvs"],
  "application/vnd.yamaha.hv-voice": ["hvp"],
  "application/vnd.yamaha.openscoreformat": ["osf"],
  "application/vnd.yamaha.openscoreformat.osfpvg+xml": ["osfpvg"],
  "application/vnd.yamaha.smaf-audio": ["saf"],
  "application/vnd.yamaha.smaf-phrase": ["spf"],
  "application/vnd.yellowriver-custom-menu": ["cmp"],
  "application/vnd.zul": ["zir","zirz"],
  "application/vnd.zzazz.deck+xml": ["zaz"],
  "application/voicexml+xml": ["vxml"],
  "application/wasm": ["wasm"],
  "application/widget": ["wgt"],
  "application/winhlp": ["hlp"],
  "application/wsdl+xml": ["wsdl"],
  "application/wspolicy+xml": ["wspolicy"],
  "application/x-7z-compressed": ["7z"],
  "application/x-abiword": ["abw"],
  "application/x-ace-compressed": ["ace"],
  "application/x-apple-diskimage": [],
  "application/x-arj": ["arj"],
  "application/x-authorware-bin": ["aab","x32","u32","vox"],
  "application/x-authorware-map": ["aam"],
  "application/x-authorware-seg": ["aas"],
  "application/x-bcpio": ["bcpio"],
  "application/x-bdoc": [],
  "application/x-bittorrent": ["torrent"],
  "application/x-blorb": ["blb","blorb"],
  "application/x-bzip": ["bz"],
  "application/x-bzip2": ["bz2","boz"],
  "application/x-cbr": ["cbr","cba","cbt","cbz","cb7"],
  "application/x-cdlink": ["vcd"],
  "application/x-cfs-compressed": ["cfs"],
  "application/x-chat": ["chat"],
  "application/x-chess-pgn": ["pgn"],
  "application/x-chrome-extension": ["crx"],
  "application/x-cocoa": ["cco"],
  "application/x-conference": ["nsc"],
  "application/x-cpio": ["cpio"],
  "application/x-csh": ["csh"],
  "application/x-debian-package": ["udeb"],
  "application/x-dgc-compressed": ["dgc"],
  "application/x-director": ["dir","dcr","dxr","cst","cct","cxt","w3d","fgd","swa"],
  "application/x-doom": ["wad"],
  "application/x-dtbncx+xml": ["ncx"],
  "application/x-dtbook+xml": ["dtb"],
  "application/x-dtbresource+xml": ["res"],
  "application/x-dvi": ["dvi"],
  "application/x-envoy": ["evy"],
  "application/x-eva": ["eva"],
  "application/x-font-bdf": ["bdf"],
  "application/x-font-ghostscript": ["gsf"],
  "application/x-font-linux-psf": ["psf"],
  "application/x-font-pcf": ["pcf"],
  "application/x-font-snf": ["snf"],
  "application/x-font-type1": ["pfa","pfb","pfm","afm"],
  "application/x-freearc": ["arc"],
  "application/x-futuresplash": ["spl"],
  "application/x-gca-compressed": ["gca"],
  "application/x-glulx": ["ulx"],
  "application/x-gnumeric": ["gnumeric"],
  "application/x-gramps-xml": ["gramps"],
  "application/x-gtar": ["gtar"],
  "application/x-hdf": ["hdf"],
  "application/x-httpd-php": ["php"],
  "application/x-install-instructions": ["install"],
  "application/x-iso9660-image": [],
  "application/x-java-archive-diff": ["jardiff"],
  "application/x-java-jnlp-file": ["jnlp"],
  "application/x-latex": ["latex"],
  "application/x-lua-bytecode": ["luac"],
  "application/x-lzh-compressed": ["lzh","lha"],
  "application/x-makeself": ["run"],
  "application/x-mie": ["mie"],
  "application/x-mobipocket-ebook": ["prc","mobi"],
  "application/x-ms-application": ["application"],
  "application/x-ms-shortcut": ["lnk"],
  "application/x-ms-wmd": ["wmd"],
  "application/x-ms-wmz": ["wmz"],
  "application/x-ms-xbap": ["xbap"],
  "application/x-msaccess": ["mdb"],
  "application/x-msbinder": ["obd"],
  "application/x-mscardfile": ["crd"],
  "application/x-msclip": ["clp"],
  "application/x-msdos-program": [],
  "application/x-msdownload": ["com","bat"],
  "application/x-msmediaview": ["mvb","m13","m14"],
  "application/x-msmetafile": ["wmf","emf","emz"],
  "application/x-msmoney": ["mny"],
  "application/x-mspublisher": ["pub"],
  "application/x-msschedule": ["scd"],
  "application/x-msterminal": ["trm"],
  "application/x-mswrite": ["wri"],
  "application/x-netcdf": ["nc","cdf"],
  "application/x-ns-proxy-autoconfig": ["pac"],
  "application/x-nzb": ["nzb"],
  "application/x-perl": ["pl","pm"],
  "application/x-pilot": [],
  "application/x-pkcs12": ["p12","pfx"],
  "application/x-pkcs7-certificates": ["p7b","spc"],
  "application/x-pkcs7-certreqresp": ["p7r"],
  "application/x-rar-compressed": ["rar"],
  "application/x-redhat-package-manager": ["rpm"],
  "application/x-research-info-systems": ["ris"],
  "application/x-sea": ["sea"],
  "application/x-sh": ["sh"],
  "application/x-shar": ["shar"],
  "application/x-shockwave-flash": ["swf"],
  "application/x-silverlight-app": ["xap"],
  "application/x-sql": ["sql"],
  "application/x-stuffit": ["sit"],
  "application/x-stuffitx": ["sitx"],
  "application/x-subrip": ["srt"],
  "application/x-sv4cpio": ["sv4cpio"],
  "application/x-sv4crc": ["sv4crc"],
  "application/x-t3vm-image": ["t3"],
  "application/x-tads": ["gam"],
  "application/x-tar": ["tar"],
  "application/x-tcl": ["tcl","tk"],
  "application/x-tex": ["tex"],
  "application/x-tex-tfm": ["tfm"],
  "application/x-texinfo": ["texinfo","texi"],
  "application/x-tgif": ["obj"],
  "application/x-ustar": ["ustar"],
  "application/x-virtualbox-hdd": ["hdd"],
  "application/x-virtualbox-ova": ["ova"],
  "application/x-virtualbox-ovf": ["ovf"],
  "application/x-virtualbox-vbox": ["vbox"],
  "application/x-virtualbox-vbox-extpack": ["vbox-extpack"],
  "application/x-virtualbox-vdi": ["vdi"],
  "application/x-virtualbox-vhd": ["vhd"],
  "application/x-virtualbox-vmdk": ["vmdk"],
  "application/x-wais-source": ["src"],
  "application/x-web-app-manifest+json": ["webapp"],
  "application/x-x509-ca-cert": ["der","crt","pem"],
  "application/x-xfig": ["fig"],
  "application/x-xliff+xml": ["xlf"],
  "application/x-xpinstall": ["xpi"],
  "application/x-xz": ["xz"],
  "application/x-zmachine": ["z1","z2","z3","z4","z5","z6","z7","z8"],
  "application/xaml+xml": ["xaml"],
  "application/xcap-diff+xml": ["xdf"],
  "application/xenc+xml": ["xenc"],
  "application/xhtml+xml": ["xhtml","xht"],
  "application/xml": ["xml","xsl","xsd","rng"],
  "application/xml-dtd": ["dtd"],
  "application/xop+xml": ["xop"],
  "application/xproc+xml": ["xpl"],
  "application/xslt+xml": ["xslt"],
  "application/xspf+xml": ["xspf"],
  "application/xv+xml": ["mxml","xhvml","xvml","xvm"],
  "application/yang": ["yang"],
  "application/yin+xml": ["yin"],
  "application/zip": ["zip"],
  "audio/3gpp": [],
  "audio/adpcm": ["adp"],
  "audio/basic": ["au","snd"],
  "audio/midi": ["mid","midi","kar","rmi"],
  "audio/mp3": [],
  "audio/mp4": ["m4a","mp4a"],
  "audio/mpeg": ["mpga","mp2","mp2a","mp3","m2a","m3a"],
  "audio/ogg": ["oga","ogg","spx"],
  "audio/s3m": ["s3m"],
  "audio/silk": ["sil"],
  "audio/vnd.dece.audio": ["uva","uvva"],
  "audio/vnd.digital-winds": ["eol"],
  "audio/vnd.dra": ["dra"],
  "audio/vnd.dts": ["dts"],
  "audio/vnd.dts.hd": ["dtshd"],
  "audio/vnd.lucent.voice": ["lvp"],
  "audio/vnd.ms-playready.media.pya": ["pya"],
  "audio/vnd.nuera.ecelp4800": ["ecelp4800"],
  "audio/vnd.nuera.ecelp7470": ["ecelp7470"],
  "audio/vnd.nuera.ecelp9600": ["ecelp9600"],
  "audio/vnd.rip": ["rip"],
  "audio/wav": ["wav"],
  "audio/wave": [],
  "audio/webm": ["weba"],
  "audio/x-aac": ["aac"],
  "audio/x-aiff": ["aif","aiff","aifc"],
  "audio/x-caf": ["caf"],
  "audio/x-flac": ["flac"],
  "audio/x-m4a": [],
  "audio/x-matroska": ["mka"],
  "audio/x-mpegurl": ["m3u"],
  "audio/x-ms-wax": ["wax"],
  "audio/x-ms-wma": ["wma"],
  "audio/x-pn-realaudio": ["ram","ra"],
  "audio/x-pn-realaudio-plugin": ["rmp"],
  "audio/x-realaudio": [],
  "audio/x-wav": [],
  "audio/xm": ["xm"],
  "chemical/x-cdx": ["cdx"],
  "chemical/x-cif": ["cif"],
  "chemical/x-cmdf": ["cmdf"],
  "chemical/x-cml": ["cml"],
  "chemical/x-csml": ["csml"],
  "chemical/x-xyz": ["xyz"],
  "font/collection": ["ttc"],
  "font/otf": ["otf"],
  "font/ttf": ["ttf"],
  "font/woff": ["woff"],
  "font/woff2": ["woff2"],
  "image/apng": ["apng"],
  "image/bmp": ["bmp"],
  "image/cgm": ["cgm"],
  "image/g3fax": ["g3"],
  "image/gif": ["gif"],
  "image/ief": ["ief"],
  "image/jp2": ["jp2","jpg2"],
  "image/jpeg": ["jpeg","jpg","jpe"],
  "image/jpm": ["jpm"],
  "image/jpx": ["jpx","jpf"],
  "image/ktx": ["ktx"],
  "image/png": ["png"],
  "image/prs.btif": ["btif"],
  "image/sgi": ["sgi"],
  "image/svg+xml": ["svg","svgz"],
  "image/tiff": ["tiff","tif"],
  "image/vnd.adobe.photoshop": ["psd"],
  "image/vnd.dece.graphic": ["uvi","uvvi","uvg","uvvg"],
  "image/vnd.djvu": ["djvu","djv"],
  "image/vnd.dvb.subtitle": [],
  "image/vnd.dwg": ["dwg"],
  "image/vnd.dxf": ["dxf"],
  "image/vnd.fastbidsheet": ["fbs"],
  "image/vnd.fpx": ["fpx"],
  "image/vnd.fst": ["fst"],
  "image/vnd.fujixerox.edmics-mmr": ["mmr"],
  "image/vnd.fujixerox.edmics-rlc": ["rlc"],
  "image/vnd.ms-modi": ["mdi"],
  "image/vnd.ms-photo": ["wdp"],
  "image/vnd.net-fpx": ["npx"],
  "image/vnd.wap.wbmp": ["wbmp"],
  "image/vnd.xiff": ["xif"],
  "image/webp": ["webp"],
  "image/x-3ds": ["3ds"],
  "image/x-cmu-raster": ["ras"],
  "image/x-cmx": ["cmx"],
  "image/x-freehand": ["fh","fhc","fh4","fh5","fh7"],
  "image/x-icon": ["ico"],
  "image/x-jng": ["jng"],
  "image/x-mrsid-image": ["sid"],
  "image/x-ms-bmp": [],
  "image/x-pcx": ["pcx"],
  "image/x-pict": ["pic","pct"],
  "image/x-portable-anymap": ["pnm"],
  "image/x-portable-bitmap": ["pbm"],
  "image/x-portable-graymap": ["pgm"],
  "image/x-portable-pixmap": ["ppm"],
  "image/x-rgb": ["rgb"],
  "image/x-tga": ["tga"],
  "image/x-xbitmap": ["xbm"],
  "image/x-xpixmap": ["xpm"],
  "image/x-xwindowdump": ["xwd"],
  "message/rfc822": ["eml","mime"],
  "model/gltf+json": ["gltf"],
  "model/gltf-binary": ["glb"],
  "model/iges": ["igs","iges"],
  "model/mesh": ["msh","mesh","silo"],
  "model/vnd.collada+xml": ["dae"],
  "model/vnd.dwf": ["dwf"],
  "model/vnd.gdl": ["gdl"],
  "model/vnd.gtw": ["gtw"],
  "model/vnd.mts": ["mts"],
  "model/vnd.vtu": ["vtu"],
  "model/vrml": ["wrl","vrml"],
  "model/x3d+binary": ["x3db","x3dbz"],
  "model/x3d+vrml": ["x3dv","x3dvz"],
  "model/x3d+xml": ["x3d","x3dz"],
  "text/cache-manifest": ["appcache","manifest"],
  "text/calendar": ["ics","ifb"],
  "text/coffeescript": ["coffee","litcoffee"],
  "text/css": ["css"],
  "text/csv": ["csv"],
  "text/hjson": ["hjson"],
  "text/html": ["html","htm","shtml"],
  "text/jade": ["jade"],
  "text/jsx": ["jsx"],
  "text/less": ["less"],
  "text/markdown": ["markdown","md"],
  "text/mathml": ["mml"],
  "text/n3": ["n3"],
  "text/plain": ["txt","text","conf","def","list","log","in","ini"],
  "text/prs.lines.tag": ["dsc"],
  "text/richtext": ["rtx"],
  "text/rtf": [],
  "text/sgml": ["sgml","sgm"],
  "text/slim": ["slim","slm"],
  "text/stylus": ["stylus","styl"],
  "text/tab-separated-values": ["tsv"],
  "text/troff": ["t","tr","roff","man","me","ms"],
  "text/turtle": ["ttl"],
  "text/uri-list": ["uri","uris","urls"],
  "text/vcard": ["vcard"],
  "text/vnd.curl": ["curl"],
  "text/vnd.curl.dcurl": ["dcurl"],
  "text/vnd.curl.mcurl": ["mcurl"],
  "text/vnd.curl.scurl": ["scurl"],
  "text/vnd.dvb.subtitle": ["sub"],
  "text/vnd.fly": ["fly"],
  "text/vnd.fmi.flexstor": ["flx"],
  "text/vnd.graphviz": ["gv"],
  "text/vnd.in3d.3dml": ["3dml"],
  "text/vnd.in3d.spot": ["spot"],
  "text/vnd.sun.j2me.app-descriptor": ["jad"],
  "text/vnd.wap.wml": ["wml"],
  "text/vnd.wap.wmlscript": ["wmls"],
  "text/vtt": ["vtt"],
  "text/x-asm": ["s","asm"],
  "text/x-c": ["c","cc","cxx","cpp","h","hh","dic"],
  "text/x-component": ["htc"],
  "text/x-fortran": ["f","for","f77","f90"],
  "text/x-handlebars-template": ["hbs"],
  "text/x-java-source": ["java"],
  "text/x-lua": ["lua"],
  "text/x-markdown": ["mkd"],
  "text/x-nfo": ["nfo"],
  "text/x-opml": ["opml"],
  "text/x-org": [],
  "text/x-pascal": ["p","pas"],
  "text/x-processing": ["pde"],
  "text/x-sass": ["sass"],
  "text/x-scss": ["scss"],
  "text/x-setext": ["etx"],
  "text/x-sfv": ["sfv"],
  "text/x-suse-ymp": ["ymp"],
  "text/x-uuencode": ["uu"],
  "text/x-vcalendar": ["vcs"],
  "text/x-vcard": ["vcf"],
  "text/xml": [],
  "text/yaml": ["yaml","yml"],
  "video/3gpp": ["3gp","3gpp"],
  "video/3gpp2": ["3g2"],
  "video/h261": ["h261"],
  "video/h263": ["h263"],
  "video/h264": ["h264"],
  "video/jpeg": ["jpgv"],
  "video/jpm": ["jpgm"],
  "video/mj2": ["mj2","mjp2"],
  "video/mp2t": ["ts"],
  "video/mp4": ["mp4","mp4v","mpg4"],
  "video/mpeg": ["mpeg","mpg","mpe","m1v","m2v"],
  "video/ogg": ["ogv"],
  "video/quicktime": ["qt","mov"],
  "video/vnd.dece.hd": ["uvh","uvvh"],
  "video/vnd.dece.mobile": ["uvm","uvvm"],
  "video/vnd.dece.pd": ["uvp","uvvp"],
  "video/vnd.dece.sd": ["uvs","uvvs"],
  "video/vnd.dece.video": ["uvv","uvvv"],
  "video/vnd.dvb.file": ["dvb"],
  "video/vnd.fvt": ["fvt"],
  "video/vnd.mpegurl": ["mxu","m4u"],
  "video/vnd.ms-playready.media.pyv": ["pyv"],
  "video/vnd.uvvu.mp4": ["uvu","uvvu"],
  "video/vnd.vivo": ["viv"],
  "video/webm": ["webm"],
  "video/x-f4v": ["f4v"],
  "video/x-fli": ["fli"],
  "video/x-flv": ["flv"],
  "video/x-m4v": ["m4v"],
  "video/x-matroska": ["mkv","mk3d","mks"],
  "video/x-mng": ["mng"],
  "video/x-ms-asf": ["asf","asx"],
  "video/x-ms-vob": ["vob"],
  "video/x-ms-wm": ["wm"],
  "video/x-ms-wmv": ["wmv"],
  "video/x-ms-wmx": ["wmx"],
  "video/x-ms-wvx": ["wvx"],
  "video/x-msvideo": ["avi"],
  "video/x-sgi-movie": ["movie"],
  "video/x-smv": ["smv"],
  "x-conference/x-cooltalk": ["ice"],
};

var mime_1;
var hasRequiredMime;

function requireMime () {
	if (hasRequiredMime) return mime_1;
	hasRequiredMime = 1;
	var fs = require$$8;

	function Mime() {
	  // Map of extension -> mime type
	  this.types = Object.create(null);

	  // Map of mime type -> extension
	  this.extensions = Object.create(null);
	}

	/**
	 * Define mimetype -> extension mappings.  Each key is a mime-type that maps
	 * to an array of extensions associated with the type.  The first extension is
	 * used as the default extension for the type.
	 *
	 * e.g. mime.define({'audio/ogg', ['oga', 'ogg', 'spx']});
	 *
	 * @param map (Object) type definitions
	 */
	Mime.prototype.define = function (map) {
	  for (var type in map) {
	    var exts = map[type];
	    for (var i = 0; i < exts.length; i++) {
	      if (process.env.DEBUG_MIME && this.types[exts[i]]) {
	        console.warn((this._loading || "define()").replace(/.*\//, ''), 'changes "' + exts[i] + '" extension type from ' +
	          this.types[exts[i]] + ' to ' + type);
	      }

	      this.types[exts[i]] = type;
	    }

	    // Default extension is the first one we encounter
	    if (!this.extensions[type]) {
	      this.extensions[type] = exts[0];
	    }
	  }
	};

	/**
	 * Load an Apache2-style ".types" file
	 *
	 * This may be called multiple times (it's expected).  Where files declare
	 * overlapping types/extensions, the last file wins.
	 *
	 * @param file (String) path of file to load.
	 */
	Mime.prototype.load = function(file) {
	  this._loading = file;
	  // Read file and split into lines
	  var map = {},
	      content = fs.readFileSync(file, 'ascii'),
	      lines = content.split(/[\r\n]+/);

	  lines.forEach(function(line) {
	    // Clean up whitespace/comments, and split into fields
	    var fields = line.replace(/\s*#.*|^\s*|\s*$/g, '').split(/\s+/);
	    map[fields.shift()] = fields;
	  });

	  this.define(map);

	  this._loading = null;
	};

	/**
	 * Lookup a mime type based on extension
	 */
	Mime.prototype.lookup = function(path, fallback) {
	  var ext = path.replace(/^.*[\.\/\\]/, '').toLowerCase();

	  return this.types[ext] || fallback || this.default_type;
	};

	/**
	 * Return file extension associated with a mime type
	 */
	Mime.prototype.extension = function(mimeType) {
	  var type = mimeType.match(/^\s*([^;\s]*)(?:;|\s|$)/)[1].toLowerCase();
	  return this.extensions[type];
	};

	// Default instance
	var mime = new Mime();

	// Define built-in types
	mime.define(require$$2);

	// Default type
	mime.default_type = mime.lookup('bin');

	//
	// Additional API specific to the default instance
	//

	mime.Mime = Mime;

	/**
	 * Lookup a charset based on mime type.
	 */
	mime.charsets = {
	  lookup: function(mimeType, fallback) {
	    // Assume text types are utf8
	    return (/^text\/|^application\/(javascript|json)/).test(mimeType) ? 'UTF-8' : fallback;
	  }
	};

	mime_1 = mime;
	return mime_1;
}

/**
 * Helpers.
 */

var ms;
var hasRequiredMs;

function requireMs () {
	if (hasRequiredMs) return ms;
	hasRequiredMs = 1;
	var s = 1000;
	var m = s * 60;
	var h = m * 60;
	var d = h * 24;
	var w = d * 7;
	var y = d * 365.25;

	/**
	 * Parse or format the given `val`.
	 *
	 * Options:
	 *
	 *  - `long` verbose formatting [false]
	 *
	 * @param {String|Number} val
	 * @param {Object} [options]
	 * @throws {Error} throw an error if val is not a non-empty string or a number
	 * @return {String|Number}
	 * @api public
	 */

	ms = function (val, options) {
	  options = options || {};
	  var type = typeof val;
	  if (type === 'string' && val.length > 0) {
	    return parse(val);
	  } else if (type === 'number' && isFinite(val)) {
	    return options.long ? fmtLong(val) : fmtShort(val);
	  }
	  throw new Error(
	    'val is not a non-empty string or a valid number. val=' +
	      JSON.stringify(val)
	  );
	};

	/**
	 * Parse the given `str` and return milliseconds.
	 *
	 * @param {String} str
	 * @return {Number}
	 * @api private
	 */

	function parse(str) {
	  str = String(str);
	  if (str.length > 100) {
	    return;
	  }
	  var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
	    str
	  );
	  if (!match) {
	    return;
	  }
	  var n = parseFloat(match[1]);
	  var type = (match[2] || 'ms').toLowerCase();
	  switch (type) {
	    case 'years':
	    case 'year':
	    case 'yrs':
	    case 'yr':
	    case 'y':
	      return n * y;
	    case 'weeks':
	    case 'week':
	    case 'w':
	      return n * w;
	    case 'days':
	    case 'day':
	    case 'd':
	      return n * d;
	    case 'hours':
	    case 'hour':
	    case 'hrs':
	    case 'hr':
	    case 'h':
	      return n * h;
	    case 'minutes':
	    case 'minute':
	    case 'mins':
	    case 'min':
	    case 'm':
	      return n * m;
	    case 'seconds':
	    case 'second':
	    case 'secs':
	    case 'sec':
	    case 's':
	      return n * s;
	    case 'milliseconds':
	    case 'millisecond':
	    case 'msecs':
	    case 'msec':
	    case 'ms':
	      return n;
	    default:
	      return undefined;
	  }
	}

	/**
	 * Short format for `ms`.
	 *
	 * @param {Number} ms
	 * @return {String}
	 * @api private
	 */

	function fmtShort(ms) {
	  var msAbs = Math.abs(ms);
	  if (msAbs >= d) {
	    return Math.round(ms / d) + 'd';
	  }
	  if (msAbs >= h) {
	    return Math.round(ms / h) + 'h';
	  }
	  if (msAbs >= m) {
	    return Math.round(ms / m) + 'm';
	  }
	  if (msAbs >= s) {
	    return Math.round(ms / s) + 's';
	  }
	  return ms + 'ms';
	}

	/**
	 * Long format for `ms`.
	 *
	 * @param {Number} ms
	 * @return {String}
	 * @api private
	 */

	function fmtLong(ms) {
	  var msAbs = Math.abs(ms);
	  if (msAbs >= d) {
	    return plural(ms, msAbs, d, 'day');
	  }
	  if (msAbs >= h) {
	    return plural(ms, msAbs, h, 'hour');
	  }
	  if (msAbs >= m) {
	    return plural(ms, msAbs, m, 'minute');
	  }
	  if (msAbs >= s) {
	    return plural(ms, msAbs, s, 'second');
	  }
	  return ms + ' ms';
	}

	/**
	 * Pluralization helper.
	 */

	function plural(ms, msAbs, n, name) {
	  var isPlural = msAbs >= n * 1.5;
	  return Math.round(ms / n) + ' ' + name + (isPlural ? 's' : '');
	}
	return ms;
}

var onFinished = {exports: {}};

/*!
 * ee-first
 * Copyright(c) 2014 Jonathan Ong
 * MIT Licensed
 */

var eeFirst;
var hasRequiredEeFirst;

function requireEeFirst () {
	if (hasRequiredEeFirst) return eeFirst;
	hasRequiredEeFirst = 1;

	/**
	 * Module exports.
	 * @public
	 */

	eeFirst = first;

	/**
	 * Get the first event in a set of event emitters and event pairs.
	 *
	 * @param {array} stuff
	 * @param {function} done
	 * @public
	 */

	function first(stuff, done) {
	  if (!Array.isArray(stuff))
	    throw new TypeError('arg must be an array of [ee, events...] arrays')

	  var cleanups = [];

	  for (var i = 0; i < stuff.length; i++) {
	    var arr = stuff[i];

	    if (!Array.isArray(arr) || arr.length < 2)
	      throw new TypeError('each array member must be [ee, events...]')

	    var ee = arr[0];

	    for (var j = 1; j < arr.length; j++) {
	      var event = arr[j];
	      var fn = listener(event, callback);

	      // listen to the event
	      ee.on(event, fn);
	      // push this listener to the list of cleanups
	      cleanups.push({
	        ee: ee,
	        event: event,
	        fn: fn,
	      });
	    }
	  }

	  function callback() {
	    cleanup();
	    done.apply(null, arguments);
	  }

	  function cleanup() {
	    var x;
	    for (var i = 0; i < cleanups.length; i++) {
	      x = cleanups[i];
	      x.ee.removeListener(x.event, x.fn);
	    }
	  }

	  function thunk(fn) {
	    done = fn;
	  }

	  thunk.cancel = cleanup;

	  return thunk
	}

	/**
	 * Create the event listener.
	 * @private
	 */

	function listener(event, done) {
	  return function onevent(arg1) {
	    var args = new Array(arguments.length);
	    var ee = this;
	    var err = event === 'error'
	      ? arg1
	      : null;

	    // copy args to prevent arguments escaping scope
	    for (var i = 0; i < args.length; i++) {
	      args[i] = arguments[i];
	    }

	    done(err, ee, event, args);
	  }
	}
	return eeFirst;
}

/*!
 * on-finished
 * Copyright(c) 2013 Jonathan Ong
 * Copyright(c) 2014 Douglas Christopher Wilson
 * MIT Licensed
 */

var hasRequiredOnFinished;

function requireOnFinished () {
	if (hasRequiredOnFinished) return onFinished.exports;
	hasRequiredOnFinished = 1;

	/**
	 * Module exports.
	 * @public
	 */

	onFinished.exports = onFinished$1;
	onFinished.exports.isFinished = isFinished;

	/**
	 * Module dependencies.
	 * @private
	 */

	var asyncHooks = tryRequireAsyncHooks();
	var first = requireEeFirst();

	/**
	 * Variables.
	 * @private
	 */

	/* istanbul ignore next */
	var defer = typeof setImmediate === 'function'
	  ? setImmediate
	  : function (fn) { process.nextTick(fn.bind.apply(fn, arguments)); };

	/**
	 * Invoke callback when the response has finished, useful for
	 * cleaning up resources afterwards.
	 *
	 * @param {object} msg
	 * @param {function} listener
	 * @return {object}
	 * @public
	 */

	function onFinished$1 (msg, listener) {
	  if (isFinished(msg) !== false) {
	    defer(listener, null, msg);
	    return msg
	  }

	  // attach the listener to the message
	  attachListener(msg, wrap(listener));

	  return msg
	}

	/**
	 * Determine if message is already finished.
	 *
	 * @param {object} msg
	 * @return {boolean}
	 * @public
	 */

	function isFinished (msg) {
	  var socket = msg.socket;

	  if (typeof msg.finished === 'boolean') {
	    // OutgoingMessage
	    return Boolean(msg.finished || (socket && !socket.writable))
	  }

	  if (typeof msg.complete === 'boolean') {
	    // IncomingMessage
	    return Boolean(msg.upgrade || !socket || !socket.readable || (msg.complete && !msg.readable))
	  }

	  // don't know
	  return undefined
	}

	/**
	 * Attach a finished listener to the message.
	 *
	 * @param {object} msg
	 * @param {function} callback
	 * @private
	 */

	function attachFinishedListener (msg, callback) {
	  var eeMsg;
	  var eeSocket;
	  var finished = false;

	  function onFinish (error) {
	    eeMsg.cancel();
	    eeSocket.cancel();

	    finished = true;
	    callback(error);
	  }

	  // finished on first message event
	  eeMsg = eeSocket = first([[msg, 'end', 'finish']], onFinish);

	  function onSocket (socket) {
	    // remove listener
	    msg.removeListener('socket', onSocket);

	    if (finished) return
	    if (eeMsg !== eeSocket) return

	    // finished on first socket event
	    eeSocket = first([[socket, 'error', 'close']], onFinish);
	  }

	  if (msg.socket) {
	    // socket already assigned
	    onSocket(msg.socket);
	    return
	  }

	  // wait for socket to be assigned
	  msg.on('socket', onSocket);

	  if (msg.socket === undefined) {
	    // istanbul ignore next: node.js 0.8 patch
	    patchAssignSocket(msg, onSocket);
	  }
	}

	/**
	 * Attach the listener to the message.
	 *
	 * @param {object} msg
	 * @return {function}
	 * @private
	 */

	function attachListener (msg, listener) {
	  var attached = msg.__onFinished;

	  // create a private single listener with queue
	  if (!attached || !attached.queue) {
	    attached = msg.__onFinished = createListener(msg);
	    attachFinishedListener(msg, attached);
	  }

	  attached.queue.push(listener);
	}

	/**
	 * Create listener on message.
	 *
	 * @param {object} msg
	 * @return {function}
	 * @private
	 */

	function createListener (msg) {
	  function listener (err) {
	    if (msg.__onFinished === listener) msg.__onFinished = null;
	    if (!listener.queue) return

	    var queue = listener.queue;
	    listener.queue = null;

	    for (var i = 0; i < queue.length; i++) {
	      queue[i](err, msg);
	    }
	  }

	  listener.queue = [];

	  return listener
	}

	/**
	 * Patch ServerResponse.prototype.assignSocket for node.js 0.8.
	 *
	 * @param {ServerResponse} res
	 * @param {function} callback
	 * @private
	 */

	// istanbul ignore next: node.js 0.8 patch
	function patchAssignSocket (res, callback) {
	  var assignSocket = res.assignSocket;

	  if (typeof assignSocket !== 'function') return

	  // res.on('socket', callback) is broken in 0.8
	  res.assignSocket = function _assignSocket (socket) {
	    assignSocket.call(this, socket);
	    callback(socket);
	  };
	}

	/**
	 * Try to require async_hooks
	 * @private
	 */

	function tryRequireAsyncHooks () {
	  try {
	    return require('async_hooks')
	  } catch (e) {
	    return {}
	  }
	}

	/**
	 * Wrap function with async resource, if possible.
	 * AsyncResource.bind static method backported.
	 * @private
	 */

	function wrap (fn) {
	  var res;

	  // create anonymous resource
	  if (asyncHooks.AsyncResource) {
	    res = new asyncHooks.AsyncResource(fn.name || 'bound-anonymous-fn');
	  }

	  // incompatible node.js
	  if (!res || !res.runInAsyncScope) {
	    return fn
	  }

	  // return bound function
	  return res.runInAsyncScope.bind(res, fn, null)
	}
	return onFinished.exports;
}

/*!
 * range-parser
 * Copyright(c) 2012-2014 TJ Holowaychuk
 * Copyright(c) 2015-2016 Douglas Christopher Wilson
 * MIT Licensed
 */

var rangeParser_1;
var hasRequiredRangeParser;

function requireRangeParser () {
	if (hasRequiredRangeParser) return rangeParser_1;
	hasRequiredRangeParser = 1;

	/**
	 * Module exports.
	 * @public
	 */

	rangeParser_1 = rangeParser;

	/**
	 * Parse "Range" header `str` relative to the given file `size`.
	 *
	 * @param {Number} size
	 * @param {String} str
	 * @param {Object} [options]
	 * @return {Array}
	 * @public
	 */

	function rangeParser (size, str, options) {
	  if (typeof str !== 'string') {
	    throw new TypeError('argument str must be a string')
	  }

	  var index = str.indexOf('=');

	  if (index === -1) {
	    return -2
	  }

	  // split the range string
	  var arr = str.slice(index + 1).split(',');
	  var ranges = [];

	  // add ranges type
	  ranges.type = str.slice(0, index);

	  // parse all ranges
	  for (var i = 0; i < arr.length; i++) {
	    var range = arr[i].split('-');
	    var start = parseInt(range[0], 10);
	    var end = parseInt(range[1], 10);

	    // -nnn
	    if (isNaN(start)) {
	      start = size - end;
	      end = size - 1;
	    // nnn-
	    } else if (isNaN(end)) {
	      end = size - 1;
	    }

	    // limit last-byte-pos to current length
	    if (end > size - 1) {
	      end = size - 1;
	    }

	    // invalid or unsatisifiable
	    if (isNaN(start) || isNaN(end) || start > end || start < 0) {
	      continue
	    }

	    // add range
	    ranges.push({
	      start: start,
	      end: end
	    });
	  }

	  if (ranges.length < 1) {
	    // unsatisifiable
	    return -1
	  }

	  return options && options.combine
	    ? combineRanges(ranges)
	    : ranges
	}

	/**
	 * Combine overlapping & adjacent ranges.
	 * @private
	 */

	function combineRanges (ranges) {
	  var ordered = ranges.map(mapWithIndex).sort(sortByRangeStart);

	  for (var j = 0, i = 1; i < ordered.length; i++) {
	    var range = ordered[i];
	    var current = ordered[j];

	    if (range.start > current.end + 1) {
	      // next range
	      ordered[++j] = range;
	    } else if (range.end > current.end) {
	      // extend range
	      current.end = range.end;
	      current.index = Math.min(current.index, range.index);
	    }
	  }

	  // trim ordered array
	  ordered.length = j + 1;

	  // generate combined range
	  var combined = ordered.sort(sortByRangeIndex).map(mapWithoutIndex);

	  // copy ranges type
	  combined.type = ranges.type;

	  return combined
	}

	/**
	 * Map function to add index value to ranges.
	 * @private
	 */

	function mapWithIndex (range, index) {
	  return {
	    start: range.start,
	    end: range.end,
	    index: index
	  }
	}

	/**
	 * Map function to remove index value from ranges.
	 * @private
	 */

	function mapWithoutIndex (range) {
	  return {
	    start: range.start,
	    end: range.end
	  }
	}

	/**
	 * Sort function to sort ranges by index.
	 * @private
	 */

	function sortByRangeIndex (a, b) {
	  return a.index - b.index
	}

	/**
	 * Sort function to sort ranges by start position.
	 * @private
	 */

	function sortByRangeStart (a, b) {
	  return a.start - b.start
	}
	return rangeParser_1;
}

/*!
 * send
 * Copyright(c) 2012 TJ Holowaychuk
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * MIT Licensed
 */

var hasRequiredSend;

function requireSend () {
	if (hasRequiredSend) return send.exports;
	hasRequiredSend = 1;

	/**
	 * Module dependencies.
	 * @private
	 */

	var createError = requireHttpErrors();
	var debug = requireSrc()('send');
	var deprecate = requireDepd()('send');
	var destroy = requireDestroy();
	var encodeUrl = requireEncodeurl();
	var escapeHtml = requireEscapeHtml();
	var etag = requireEtag();
	var fresh = requireFresh();
	var fs = require$$8;
	var mime = requireMime();
	var ms = requireMs();
	var onFinished = requireOnFinished();
	var parseRange = requireRangeParser();
	var path = require$$3;
	var statuses = requireStatuses();
	var Stream = require$$15;
	var util = require$$16;

	/**
	 * Path function references.
	 * @private
	 */

	var extname = path.extname;
	var join = path.join;
	var normalize = path.normalize;
	var resolve = path.resolve;
	var sep = path.sep;

	/**
	 * Regular expression for identifying a bytes Range header.
	 * @private
	 */

	var BYTES_RANGE_REGEXP = /^ *bytes=/;

	/**
	 * Maximum value allowed for the max age.
	 * @private
	 */

	var MAX_MAXAGE = 60 * 60 * 24 * 365 * 1000; // 1 year

	/**
	 * Regular expression to match a path with a directory up component.
	 * @private
	 */

	var UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/;

	/**
	 * Module exports.
	 * @public
	 */

	send.exports = send$1;
	send.exports.mime = mime;

	/**
	 * Return a `SendStream` for `req` and `path`.
	 *
	 * @param {object} req
	 * @param {string} path
	 * @param {object} [options]
	 * @return {SendStream}
	 * @public
	 */

	function send$1 (req, path, options) {
	  return new SendStream(req, path, options)
	}

	/**
	 * Initialize a `SendStream` with the given `path`.
	 *
	 * @param {Request} req
	 * @param {String} path
	 * @param {object} [options]
	 * @private
	 */

	function SendStream (req, path, options) {
	  Stream.call(this);

	  var opts = options || {};

	  this.options = opts;
	  this.path = path;
	  this.req = req;

	  this._acceptRanges = opts.acceptRanges !== undefined
	    ? Boolean(opts.acceptRanges)
	    : true;

	  this._cacheControl = opts.cacheControl !== undefined
	    ? Boolean(opts.cacheControl)
	    : true;

	  this._etag = opts.etag !== undefined
	    ? Boolean(opts.etag)
	    : true;

	  this._dotfiles = opts.dotfiles !== undefined
	    ? opts.dotfiles
	    : 'ignore';

	  if (this._dotfiles !== 'ignore' && this._dotfiles !== 'allow' && this._dotfiles !== 'deny') {
	    throw new TypeError('dotfiles option must be "allow", "deny", or "ignore"')
	  }

	  this._hidden = Boolean(opts.hidden);

	  if (opts.hidden !== undefined) {
	    deprecate('hidden: use dotfiles: \'' + (this._hidden ? 'allow' : 'ignore') + '\' instead');
	  }

	  // legacy support
	  if (opts.dotfiles === undefined) {
	    this._dotfiles = undefined;
	  }

	  this._extensions = opts.extensions !== undefined
	    ? normalizeList(opts.extensions, 'extensions option')
	    : [];

	  this._immutable = opts.immutable !== undefined
	    ? Boolean(opts.immutable)
	    : false;

	  this._index = opts.index !== undefined
	    ? normalizeList(opts.index, 'index option')
	    : ['index.html'];

	  this._lastModified = opts.lastModified !== undefined
	    ? Boolean(opts.lastModified)
	    : true;

	  this._maxage = opts.maxAge || opts.maxage;
	  this._maxage = typeof this._maxage === 'string'
	    ? ms(this._maxage)
	    : Number(this._maxage);
	  this._maxage = !isNaN(this._maxage)
	    ? Math.min(Math.max(0, this._maxage), MAX_MAXAGE)
	    : 0;

	  this._root = opts.root
	    ? resolve(opts.root)
	    : null;

	  if (!this._root && opts.from) {
	    this.from(opts.from);
	  }
	}

	/**
	 * Inherits from `Stream`.
	 */

	util.inherits(SendStream, Stream);

	/**
	 * Enable or disable etag generation.
	 *
	 * @param {Boolean} val
	 * @return {SendStream}
	 * @api public
	 */

	SendStream.prototype.etag = deprecate.function(function etag (val) {
	  this._etag = Boolean(val);
	  debug('etag %s', this._etag);
	  return this
	}, 'send.etag: pass etag as option');

	/**
	 * Enable or disable "hidden" (dot) files.
	 *
	 * @param {Boolean} path
	 * @return {SendStream}
	 * @api public
	 */

	SendStream.prototype.hidden = deprecate.function(function hidden (val) {
	  this._hidden = Boolean(val);
	  this._dotfiles = undefined;
	  debug('hidden %s', this._hidden);
	  return this
	}, 'send.hidden: use dotfiles option');

	/**
	 * Set index `paths`, set to a falsy
	 * value to disable index support.
	 *
	 * @param {String|Boolean|Array} paths
	 * @return {SendStream}
	 * @api public
	 */

	SendStream.prototype.index = deprecate.function(function index (paths) {
	  var index = !paths ? [] : normalizeList(paths, 'paths argument');
	  debug('index %o', paths);
	  this._index = index;
	  return this
	}, 'send.index: pass index as option');

	/**
	 * Set root `path`.
	 *
	 * @param {String} path
	 * @return {SendStream}
	 * @api public
	 */

	SendStream.prototype.root = function root (path) {
	  this._root = resolve(String(path));
	  debug('root %s', this._root);
	  return this
	};

	SendStream.prototype.from = deprecate.function(SendStream.prototype.root,
	  'send.from: pass root as option');

	SendStream.prototype.root = deprecate.function(SendStream.prototype.root,
	  'send.root: pass root as option');

	/**
	 * Set max-age to `maxAge`.
	 *
	 * @param {Number} maxAge
	 * @return {SendStream}
	 * @api public
	 */

	SendStream.prototype.maxage = deprecate.function(function maxage (maxAge) {
	  this._maxage = typeof maxAge === 'string'
	    ? ms(maxAge)
	    : Number(maxAge);
	  this._maxage = !isNaN(this._maxage)
	    ? Math.min(Math.max(0, this._maxage), MAX_MAXAGE)
	    : 0;
	  debug('max-age %d', this._maxage);
	  return this
	}, 'send.maxage: pass maxAge as option');

	/**
	 * Emit error with `status`.
	 *
	 * @param {number} status
	 * @param {Error} [err]
	 * @private
	 */

	SendStream.prototype.error = function error (status, err) {
	  // emit if listeners instead of responding
	  if (hasListeners(this, 'error')) {
	    return this.emit('error', createHttpError(status, err))
	  }

	  var res = this.res;
	  var msg = statuses.message[status] || String(status);
	  var doc = createHtmlDocument('Error', escapeHtml(msg));

	  // clear existing headers
	  clearHeaders(res);

	  // add error headers
	  if (err && err.headers) {
	    setHeaders(res, err.headers);
	  }

	  // send basic response
	  res.statusCode = status;
	  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
	  res.setHeader('Content-Length', Buffer.byteLength(doc));
	  res.setHeader('Content-Security-Policy', "default-src 'none'");
	  res.setHeader('X-Content-Type-Options', 'nosniff');
	  res.end(doc);
	};

	/**
	 * Check if the pathname ends with "/".
	 *
	 * @return {boolean}
	 * @private
	 */

	SendStream.prototype.hasTrailingSlash = function hasTrailingSlash () {
	  return this.path[this.path.length - 1] === '/'
	};

	/**
	 * Check if this is a conditional GET request.
	 *
	 * @return {Boolean}
	 * @api private
	 */

	SendStream.prototype.isConditionalGET = function isConditionalGET () {
	  return this.req.headers['if-match'] ||
	    this.req.headers['if-unmodified-since'] ||
	    this.req.headers['if-none-match'] ||
	    this.req.headers['if-modified-since']
	};

	/**
	 * Check if the request preconditions failed.
	 *
	 * @return {boolean}
	 * @private
	 */

	SendStream.prototype.isPreconditionFailure = function isPreconditionFailure () {
	  var req = this.req;
	  var res = this.res;

	  // if-match
	  var match = req.headers['if-match'];
	  if (match) {
	    var etag = res.getHeader('ETag');
	    return !etag || (match !== '*' && parseTokenList(match).every(function (match) {
	      return match !== etag && match !== 'W/' + etag && 'W/' + match !== etag
	    }))
	  }

	  // if-unmodified-since
	  var unmodifiedSince = parseHttpDate(req.headers['if-unmodified-since']);
	  if (!isNaN(unmodifiedSince)) {
	    var lastModified = parseHttpDate(res.getHeader('Last-Modified'));
	    return isNaN(lastModified) || lastModified > unmodifiedSince
	  }

	  return false
	};

	/**
	 * Strip various content header fields for a change in entity.
	 *
	 * @private
	 */

	SendStream.prototype.removeContentHeaderFields = function removeContentHeaderFields () {
	  var res = this.res;

	  res.removeHeader('Content-Encoding');
	  res.removeHeader('Content-Language');
	  res.removeHeader('Content-Length');
	  res.removeHeader('Content-Range');
	  res.removeHeader('Content-Type');
	};

	/**
	 * Respond with 304 not modified.
	 *
	 * @api private
	 */

	SendStream.prototype.notModified = function notModified () {
	  var res = this.res;
	  debug('not modified');
	  this.removeContentHeaderFields();
	  res.statusCode = 304;
	  res.end();
	};

	/**
	 * Raise error that headers already sent.
	 *
	 * @api private
	 */

	SendStream.prototype.headersAlreadySent = function headersAlreadySent () {
	  var err = new Error('Can\'t set headers after they are sent.');
	  debug('headers already sent');
	  this.error(500, err);
	};

	/**
	 * Check if the request is cacheable, aka
	 * responded with 2xx or 304 (see RFC 2616 section 14.2{5,6}).
	 *
	 * @return {Boolean}
	 * @api private
	 */

	SendStream.prototype.isCachable = function isCachable () {
	  var statusCode = this.res.statusCode;
	  return (statusCode >= 200 && statusCode < 300) ||
	    statusCode === 304
	};

	/**
	 * Handle stat() error.
	 *
	 * @param {Error} error
	 * @private
	 */

	SendStream.prototype.onStatError = function onStatError (error) {
	  switch (error.code) {
	    case 'ENAMETOOLONG':
	    case 'ENOENT':
	    case 'ENOTDIR':
	      this.error(404, error);
	      break
	    default:
	      this.error(500, error);
	      break
	  }
	};

	/**
	 * Check if the cache is fresh.
	 *
	 * @return {Boolean}
	 * @api private
	 */

	SendStream.prototype.isFresh = function isFresh () {
	  return fresh(this.req.headers, {
	    etag: this.res.getHeader('ETag'),
	    'last-modified': this.res.getHeader('Last-Modified')
	  })
	};

	/**
	 * Check if the range is fresh.
	 *
	 * @return {Boolean}
	 * @api private
	 */

	SendStream.prototype.isRangeFresh = function isRangeFresh () {
	  var ifRange = this.req.headers['if-range'];

	  if (!ifRange) {
	    return true
	  }

	  // if-range as etag
	  if (ifRange.indexOf('"') !== -1) {
	    var etag = this.res.getHeader('ETag');
	    return Boolean(etag && ifRange.indexOf(etag) !== -1)
	  }

	  // if-range as modified date
	  var lastModified = this.res.getHeader('Last-Modified');
	  return parseHttpDate(lastModified) <= parseHttpDate(ifRange)
	};

	/**
	 * Redirect to path.
	 *
	 * @param {string} path
	 * @private
	 */

	SendStream.prototype.redirect = function redirect (path) {
	  var res = this.res;

	  if (hasListeners(this, 'directory')) {
	    this.emit('directory', res, path);
	    return
	  }

	  if (this.hasTrailingSlash()) {
	    this.error(403);
	    return
	  }

	  var loc = encodeUrl(collapseLeadingSlashes(this.path + '/'));
	  var doc = createHtmlDocument('Redirecting', 'Redirecting to ' + escapeHtml(loc));

	  // redirect
	  res.statusCode = 301;
	  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
	  res.setHeader('Content-Length', Buffer.byteLength(doc));
	  res.setHeader('Content-Security-Policy', "default-src 'none'");
	  res.setHeader('X-Content-Type-Options', 'nosniff');
	  res.setHeader('Location', loc);
	  res.end(doc);
	};

	/**
	 * Pipe to `res.
	 *
	 * @param {Stream} res
	 * @return {Stream} res
	 * @api public
	 */

	SendStream.prototype.pipe = function pipe (res) {
	  // root path
	  var root = this._root;

	  // references
	  this.res = res;

	  // decode the path
	  var path = decode(this.path);
	  if (path === -1) {
	    this.error(400);
	    return res
	  }

	  // null byte(s)
	  if (~path.indexOf('\0')) {
	    this.error(400);
	    return res
	  }

	  var parts;
	  if (root !== null) {
	    // normalize
	    if (path) {
	      path = normalize('.' + sep + path);
	    }

	    // malicious path
	    if (UP_PATH_REGEXP.test(path)) {
	      debug('malicious path "%s"', path);
	      this.error(403);
	      return res
	    }

	    // explode path parts
	    parts = path.split(sep);

	    // join / normalize from optional root dir
	    path = normalize(join(root, path));
	  } else {
	    // ".." is malicious without "root"
	    if (UP_PATH_REGEXP.test(path)) {
	      debug('malicious path "%s"', path);
	      this.error(403);
	      return res
	    }

	    // explode path parts
	    parts = normalize(path).split(sep);

	    // resolve the path
	    path = resolve(path);
	  }

	  // dotfile handling
	  if (containsDotFile(parts)) {
	    var access = this._dotfiles;

	    // legacy support
	    if (access === undefined) {
	      access = parts[parts.length - 1][0] === '.'
	        ? (this._hidden ? 'allow' : 'ignore')
	        : 'allow';
	    }

	    debug('%s dotfile "%s"', access, path);
	    switch (access) {
	      case 'allow':
	        break
	      case 'deny':
	        this.error(403);
	        return res
	      case 'ignore':
	      default:
	        this.error(404);
	        return res
	    }
	  }

	  // index file support
	  if (this._index.length && this.hasTrailingSlash()) {
	    this.sendIndex(path);
	    return res
	  }

	  this.sendFile(path);
	  return res
	};

	/**
	 * Transfer `path`.
	 *
	 * @param {String} path
	 * @api public
	 */

	SendStream.prototype.send = function send (path, stat) {
	  var len = stat.size;
	  var options = this.options;
	  var opts = {};
	  var res = this.res;
	  var req = this.req;
	  var ranges = req.headers.range;
	  var offset = options.start || 0;

	  if (headersSent(res)) {
	    // impossible to send now
	    this.headersAlreadySent();
	    return
	  }

	  debug('pipe "%s"', path);

	  // set header fields
	  this.setHeader(path, stat);

	  // set content-type
	  this.type(path);

	  // conditional GET support
	  if (this.isConditionalGET()) {
	    if (this.isPreconditionFailure()) {
	      this.error(412);
	      return
	    }

	    if (this.isCachable() && this.isFresh()) {
	      this.notModified();
	      return
	    }
	  }

	  // adjust len to start/end options
	  len = Math.max(0, len - offset);
	  if (options.end !== undefined) {
	    var bytes = options.end - offset + 1;
	    if (len > bytes) len = bytes;
	  }

	  // Range support
	  if (this._acceptRanges && BYTES_RANGE_REGEXP.test(ranges)) {
	    // parse
	    ranges = parseRange(len, ranges, {
	      combine: true
	    });

	    // If-Range support
	    if (!this.isRangeFresh()) {
	      debug('range stale');
	      ranges = -2;
	    }

	    // unsatisfiable
	    if (ranges === -1) {
	      debug('range unsatisfiable');

	      // Content-Range
	      res.setHeader('Content-Range', contentRange('bytes', len));

	      // 416 Requested Range Not Satisfiable
	      return this.error(416, {
	        headers: { 'Content-Range': res.getHeader('Content-Range') }
	      })
	    }

	    // valid (syntactically invalid/multiple ranges are treated as a regular response)
	    if (ranges !== -2 && ranges.length === 1) {
	      debug('range %j', ranges);

	      // Content-Range
	      res.statusCode = 206;
	      res.setHeader('Content-Range', contentRange('bytes', len, ranges[0]));

	      // adjust for requested range
	      offset += ranges[0].start;
	      len = ranges[0].end - ranges[0].start + 1;
	    }
	  }

	  // clone options
	  for (var prop in options) {
	    opts[prop] = options[prop];
	  }

	  // set read options
	  opts.start = offset;
	  opts.end = Math.max(offset, offset + len - 1);

	  // content-length
	  res.setHeader('Content-Length', len);

	  // HEAD support
	  if (req.method === 'HEAD') {
	    res.end();
	    return
	  }

	  this.stream(path, opts);
	};

	/**
	 * Transfer file for `path`.
	 *
	 * @param {String} path
	 * @api private
	 */
	SendStream.prototype.sendFile = function sendFile (path) {
	  var i = 0;
	  var self = this;

	  debug('stat "%s"', path);
	  fs.stat(path, function onstat (err, stat) {
	    if (err && err.code === 'ENOENT' && !extname(path) && path[path.length - 1] !== sep) {
	      // not found, check extensions
	      return next(err)
	    }
	    if (err) return self.onStatError(err)
	    if (stat.isDirectory()) return self.redirect(path)
	    self.emit('file', path, stat);
	    self.send(path, stat);
	  });

	  function next (err) {
	    if (self._extensions.length <= i) {
	      return err
	        ? self.onStatError(err)
	        : self.error(404)
	    }

	    var p = path + '.' + self._extensions[i++];

	    debug('stat "%s"', p);
	    fs.stat(p, function (err, stat) {
	      if (err) return next(err)
	      if (stat.isDirectory()) return next()
	      self.emit('file', p, stat);
	      self.send(p, stat);
	    });
	  }
	};

	/**
	 * Transfer index for `path`.
	 *
	 * @param {String} path
	 * @api private
	 */
	SendStream.prototype.sendIndex = function sendIndex (path) {
	  var i = -1;
	  var self = this;

	  function next (err) {
	    if (++i >= self._index.length) {
	      if (err) return self.onStatError(err)
	      return self.error(404)
	    }

	    var p = join(path, self._index[i]);

	    debug('stat "%s"', p);
	    fs.stat(p, function (err, stat) {
	      if (err) return next(err)
	      if (stat.isDirectory()) return next()
	      self.emit('file', p, stat);
	      self.send(p, stat);
	    });
	  }

	  next();
	};

	/**
	 * Stream `path` to the response.
	 *
	 * @param {String} path
	 * @param {Object} options
	 * @api private
	 */

	SendStream.prototype.stream = function stream (path, options) {
	  var self = this;
	  var res = this.res;

	  // pipe
	  var stream = fs.createReadStream(path, options);
	  this.emit('stream', stream);
	  stream.pipe(res);

	  // cleanup
	  function cleanup () {
	    destroy(stream, true);
	  }

	  // response finished, cleanup
	  onFinished(res, cleanup);

	  // error handling
	  stream.on('error', function onerror (err) {
	    // clean up stream early
	    cleanup();

	    // error
	    self.onStatError(err);
	  });

	  // end
	  stream.on('end', function onend () {
	    self.emit('end');
	  });
	};

	/**
	 * Set content-type based on `path`
	 * if it hasn't been explicitly set.
	 *
	 * @param {String} path
	 * @api private
	 */

	SendStream.prototype.type = function type (path) {
	  var res = this.res;

	  if (res.getHeader('Content-Type')) return

	  var type = mime.lookup(path);

	  if (!type) {
	    debug('no content-type');
	    return
	  }

	  var charset = mime.charsets.lookup(type);

	  debug('content-type %s', type);
	  res.setHeader('Content-Type', type + (charset ? '; charset=' + charset : ''));
	};

	/**
	 * Set response header fields, most
	 * fields may be pre-defined.
	 *
	 * @param {String} path
	 * @param {Object} stat
	 * @api private
	 */

	SendStream.prototype.setHeader = function setHeader (path, stat) {
	  var res = this.res;

	  this.emit('headers', res, path, stat);

	  if (this._acceptRanges && !res.getHeader('Accept-Ranges')) {
	    debug('accept ranges');
	    res.setHeader('Accept-Ranges', 'bytes');
	  }

	  if (this._cacheControl && !res.getHeader('Cache-Control')) {
	    var cacheControl = 'public, max-age=' + Math.floor(this._maxage / 1000);

	    if (this._immutable) {
	      cacheControl += ', immutable';
	    }

	    debug('cache-control %s', cacheControl);
	    res.setHeader('Cache-Control', cacheControl);
	  }

	  if (this._lastModified && !res.getHeader('Last-Modified')) {
	    var modified = stat.mtime.toUTCString();
	    debug('modified %s', modified);
	    res.setHeader('Last-Modified', modified);
	  }

	  if (this._etag && !res.getHeader('ETag')) {
	    var val = etag(stat);
	    debug('etag %s', val);
	    res.setHeader('ETag', val);
	  }
	};

	/**
	 * Clear all headers from a response.
	 *
	 * @param {object} res
	 * @private
	 */

	function clearHeaders (res) {
	  var headers = getHeaderNames(res);

	  for (var i = 0; i < headers.length; i++) {
	    res.removeHeader(headers[i]);
	  }
	}

	/**
	 * Collapse all leading slashes into a single slash
	 *
	 * @param {string} str
	 * @private
	 */
	function collapseLeadingSlashes (str) {
	  for (var i = 0; i < str.length; i++) {
	    if (str[i] !== '/') {
	      break
	    }
	  }

	  return i > 1
	    ? '/' + str.substr(i)
	    : str
	}

	/**
	 * Determine if path parts contain a dotfile.
	 *
	 * @api private
	 */

	function containsDotFile (parts) {
	  for (var i = 0; i < parts.length; i++) {
	    var part = parts[i];
	    if (part.length > 1 && part[0] === '.') {
	      return true
	    }
	  }

	  return false
	}

	/**
	 * Create a Content-Range header.
	 *
	 * @param {string} type
	 * @param {number} size
	 * @param {array} [range]
	 */

	function contentRange (type, size, range) {
	  return type + ' ' + (range ? range.start + '-' + range.end : '*') + '/' + size
	}

	/**
	 * Create a minimal HTML document.
	 *
	 * @param {string} title
	 * @param {string} body
	 * @private
	 */

	function createHtmlDocument (title, body) {
	  return '<!DOCTYPE html>\n' +
	    '<html lang="en">\n' +
	    '<head>\n' +
	    '<meta charset="utf-8">\n' +
	    '<title>' + title + '</title>\n' +
	    '</head>\n' +
	    '<body>\n' +
	    '<pre>' + body + '</pre>\n' +
	    '</body>\n' +
	    '</html>\n'
	}

	/**
	 * Create a HttpError object from simple arguments.
	 *
	 * @param {number} status
	 * @param {Error|object} err
	 * @private
	 */

	function createHttpError (status, err) {
	  if (!err) {
	    return createError(status)
	  }

	  return err instanceof Error
	    ? createError(status, err, { expose: false })
	    : createError(status, err)
	}

	/**
	 * decodeURIComponent.
	 *
	 * Allows V8 to only deoptimize this fn instead of all
	 * of send().
	 *
	 * @param {String} path
	 * @api private
	 */

	function decode (path) {
	  try {
	    return decodeURIComponent(path)
	  } catch (err) {
	    return -1
	  }
	}

	/**
	 * Get the header names on a respnse.
	 *
	 * @param {object} res
	 * @returns {array[string]}
	 * @private
	 */

	function getHeaderNames (res) {
	  return typeof res.getHeaderNames !== 'function'
	    ? Object.keys(res._headers || {})
	    : res.getHeaderNames()
	}

	/**
	 * Determine if emitter has listeners of a given type.
	 *
	 * The way to do this check is done three different ways in Node.js >= 0.8
	 * so this consolidates them into a minimal set using instance methods.
	 *
	 * @param {EventEmitter} emitter
	 * @param {string} type
	 * @returns {boolean}
	 * @private
	 */

	function hasListeners (emitter, type) {
	  var count = typeof emitter.listenerCount !== 'function'
	    ? emitter.listeners(type).length
	    : emitter.listenerCount(type);

	  return count > 0
	}

	/**
	 * Determine if the response headers have been sent.
	 *
	 * @param {object} res
	 * @returns {boolean}
	 * @private
	 */

	function headersSent (res) {
	  return typeof res.headersSent !== 'boolean'
	    ? Boolean(res._header)
	    : res.headersSent
	}

	/**
	 * Normalize the index option into an array.
	 *
	 * @param {boolean|string|array} val
	 * @param {string} name
	 * @private
	 */

	function normalizeList (val, name) {
	  var list = [].concat(val || []);

	  for (var i = 0; i < list.length; i++) {
	    if (typeof list[i] !== 'string') {
	      throw new TypeError(name + ' must be array of strings or false')
	    }
	  }

	  return list
	}

	/**
	 * Parse an HTTP Date into a number.
	 *
	 * @param {string} date
	 * @private
	 */

	function parseHttpDate (date) {
	  var timestamp = date && Date.parse(date);

	  return typeof timestamp === 'number'
	    ? timestamp
	    : NaN
	}

	/**
	 * Parse a HTTP token list.
	 *
	 * @param {string} str
	 * @private
	 */

	function parseTokenList (str) {
	  var end = 0;
	  var list = [];
	  var start = 0;

	  // gather tokens
	  for (var i = 0, len = str.length; i < len; i++) {
	    switch (str.charCodeAt(i)) {
	      case 0x20: /*   */
	        if (start === end) {
	          start = end = i + 1;
	        }
	        break
	      case 0x2c: /* , */
	        if (start !== end) {
	          list.push(str.substring(start, end));
	        }
	        start = end = i + 1;
	        break
	      default:
	        end = i + 1;
	        break
	    }
	  }

	  // final token
	  if (start !== end) {
	    list.push(str.substring(start, end));
	  }

	  return list
	}

	/**
	 * Set an object of headers on a response.
	 *
	 * @param {object} res
	 * @param {object} headers
	 * @private
	 */

	function setHeaders (res, headers) {
	  var keys = Object.keys(headers);

	  for (var i = 0; i < keys.length; i++) {
	    var key = keys[i];
	    res.setHeader(key, headers[key]);
	  }
	}
	return send.exports;
}

/*!
 * serve-static
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2014-2016 Douglas Christopher Wilson
 * MIT Licensed
 */

var hasRequiredServeStatic;

function requireServeStatic () {
	if (hasRequiredServeStatic) return serveStatic.exports;
	hasRequiredServeStatic = 1;

	/**
	 * Module dependencies.
	 * @private
	 */

	var encodeUrl = requireEncodeurl$1();
	var escapeHtml = requireEscapeHtml();
	var parseUrl = requireParseurl();
	var resolve = require$$3.resolve;
	var send = requireSend();
	var url = require$$5;

	/**
	 * Module exports.
	 * @public
	 */

	serveStatic.exports = serveStatic$1;
	serveStatic.exports.mime = send.mime;

	/**
	 * @param {string} root
	 * @param {object} [options]
	 * @return {function}
	 * @public
	 */

	function serveStatic$1 (root, options) {
	  if (!root) {
	    throw new TypeError('root path required')
	  }

	  if (typeof root !== 'string') {
	    throw new TypeError('root path must be a string')
	  }

	  // copy options object
	  var opts = Object.create(options || null);

	  // fall-though
	  var fallthrough = opts.fallthrough !== false;

	  // default redirect
	  var redirect = opts.redirect !== false;

	  // headers listener
	  var setHeaders = opts.setHeaders;

	  if (setHeaders && typeof setHeaders !== 'function') {
	    throw new TypeError('option setHeaders must be function')
	  }

	  // setup options for send
	  opts.maxage = opts.maxage || opts.maxAge || 0;
	  opts.root = resolve(root);

	  // construct directory listener
	  var onDirectory = redirect
	    ? createRedirectDirectoryListener()
	    : createNotFoundDirectoryListener();

	  return function serveStatic (req, res, next) {
	    if (req.method !== 'GET' && req.method !== 'HEAD') {
	      if (fallthrough) {
	        return next()
	      }

	      // method not allowed
	      res.statusCode = 405;
	      res.setHeader('Allow', 'GET, HEAD');
	      res.setHeader('Content-Length', '0');
	      res.end();
	      return
	    }

	    var forwardError = !fallthrough;
	    var originalUrl = parseUrl.original(req);
	    var path = parseUrl(req).pathname;

	    // make sure redirect occurs at mount
	    if (path === '/' && originalUrl.pathname.substr(-1) !== '/') {
	      path = '';
	    }

	    // create send stream
	    var stream = send(req, path, opts);

	    // add directory handler
	    stream.on('directory', onDirectory);

	    // add headers listener
	    if (setHeaders) {
	      stream.on('headers', setHeaders);
	    }

	    // add file listener for fallthrough
	    if (fallthrough) {
	      stream.on('file', function onFile () {
	        // once file is determined, always forward error
	        forwardError = true;
	      });
	    }

	    // forward errors
	    stream.on('error', function error (err) {
	      if (forwardError || !(err.statusCode < 500)) {
	        next(err);
	        return
	      }

	      next();
	    });

	    // pipe
	    stream.pipe(res);
	  }
	}

	/**
	 * Collapse all leading slashes into a single slash
	 * @private
	 */
	function collapseLeadingSlashes (str) {
	  for (var i = 0; i < str.length; i++) {
	    if (str.charCodeAt(i) !== 0x2f /* / */) {
	      break
	    }
	  }

	  return i > 1
	    ? '/' + str.substr(i)
	    : str
	}

	/**
	 * Create a minimal HTML document.
	 *
	 * @param {string} title
	 * @param {string} body
	 * @private
	 */

	function createHtmlDocument (title, body) {
	  return '<!DOCTYPE html>\n' +
	    '<html lang="en">\n' +
	    '<head>\n' +
	    '<meta charset="utf-8">\n' +
	    '<title>' + title + '</title>\n' +
	    '</head>\n' +
	    '<body>\n' +
	    '<pre>' + body + '</pre>\n' +
	    '</body>\n' +
	    '</html>\n'
	}

	/**
	 * Create a directory listener that just 404s.
	 * @private
	 */

	function createNotFoundDirectoryListener () {
	  return function notFound () {
	    this.error(404);
	  }
	}

	/**
	 * Create a directory listener that performs a redirect.
	 * @private
	 */

	function createRedirectDirectoryListener () {
	  return function redirect (res) {
	    if (this.hasTrailingSlash()) {
	      this.error(404);
	      return
	    }

	    // get original URL
	    var originalUrl = parseUrl.original(this.req);

	    // append trailing slash
	    originalUrl.path = null;
	    originalUrl.pathname = collapseLeadingSlashes(originalUrl.pathname + '/');

	    // reformat the URL
	    var loc = encodeUrl(url.format(originalUrl));
	    var doc = createHtmlDocument('Redirecting', 'Redirecting to ' + escapeHtml(loc));

	    // send redirect response
	    res.statusCode = 301;
	    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
	    res.setHeader('Content-Length', Buffer.byteLength(doc));
	    res.setHeader('Content-Security-Policy', "default-src 'none'");
	    res.setHeader('X-Content-Type-Options', 'nosniff');
	    res.setHeader('Location', loc);
	    res.end(doc);
	  }
	}
	return serveStatic.exports;
}

var serveStaticExports = requireServeStatic();
const createStaticServe = /*@__PURE__*/getDefaultExportFromCjs(serveStaticExports);

const __dirname = dirname(fileURLToPath(import.meta.url));

const { PORT = 3000 } = process.env;

const middleware = createMiddleware(fetch);
const compress = compression({
  flush: zlib__default.constants.Z_PARTIAL_FLUSH,
  threshold: 500,
});

const servePublic = createStaticServe(`${__dirname}/public`, {
  index: false,
  redirect: false,
  maxAge: "10 minutes",
});

const serveAssets = createStaticServe(`${__dirname}/public/assets`, {
  index: false,
  redirect: false,
  immutable: true,
  fallthrough: false,
  maxAge: "365 days",
});

createServer((req, res) =>
  compress(req, res, () => {
    if (req.url.startsWith("/assets/")) {
      req.url = req.url.slice(7);
      serveAssets(req, res, () => {
        res.statusCode = 404;
        res.end();
      });
    } else {
      servePublic(req, res, () => middleware(req, res));
    }
  }),
).listen(PORT);
;var __MARKO_MANIFEST__={"route_5lM3":{"head-prepend":null,"head":[2,"/assets/route.marko-B8bhSyqx.js",6,"<script",0," async type=\"module\" crossorigin src=\"",1,"assets/route.marko-B8bhSyqx.js\"","></script>",2,"modulepreload#/assets/_DkqK2axP.js",6,"<link",0," rel=\"modulepreload\" crossorigin href=\"",1,"assets/_DkqK2axP.js\"",">",2,"stylesheet#/assets/_CL4m4kOA.css",6,"<link",0," rel=\"stylesheet\" crossorigin href=\"",1,"assets/_CL4m4kOA.css\"",">",2,"stylesheet#/assets/route-BeWIlbrf.css",6,"<link",0," rel=\"stylesheet\" crossorigin href=\"",1,"assets/route-BeWIlbrf.css\"",">"],"body-prepend":null,"body":null},"route_XpU7":{"head-prepend":null,"head":[2,"/assets/route.marko-DY-tRkOI.js",6,"<script",0," async type=\"module\" crossorigin src=\"",1,"assets/route.marko-DY-tRkOI.js\"","></script>",2,"modulepreload#/assets/_DkqK2axP.js",6,"<link",0," rel=\"modulepreload\" crossorigin href=\"",1,"assets/_DkqK2axP.js\"",">",2,"stylesheet#/assets/_CL4m4kOA.css",6,"<link",0," rel=\"stylesheet\" crossorigin href=\"",1,"assets/_CL4m4kOA.css\"",">",2,"stylesheet#/assets/route-DaFXCwBg.css",6,"<link",0," rel=\"stylesheet\" crossorigin href=\"",1,"assets/route-DaFXCwBg.css\"",">"],"body-prepend":null,"body":null}};
