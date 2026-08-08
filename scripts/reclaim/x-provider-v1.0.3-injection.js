(function () {
  var guardKey = "__earlyReplyVerificationGuardV103";
  var reloadKey = "early-reclaim-viewer-request-reload-v103";

  function boot() {
    if (!window.Reclaim || !window.reclaimInterceptor) {
      window.setTimeout(boot, 10);
      return;
    }

    if (window[guardKey]) return;
    window[guardKey] = true;

    var viewerRequest = null;
    var replyRequestSeen = false;
    var viewerClaimStarted = false;
    var reloadTimer = null;

    function log(level, message) {
      try {
        window.Reclaim.log(level, message);
      } catch {}
    }

    function requestUrlOf(request) {
      if (!request) return "";
      if (typeof request.url === "string") return request.url;
      if (request.url && typeof request.url.url === "string") {
        return request.url.url;
      }
      if (typeof request.href === "string") return request.href;
      return "";
    }

    function requestHeadersOf(request) {
      var source = request && (request.headers || request.requestHeaders);
      var headers = {};

      if (!source) return headers;

      if (Array.isArray(source)) {
        source.forEach(function (header) {
          if (!header || typeof header.name !== "string") return;
          if (typeof header.value !== "string") return;
          headers[header.name] = header.value;
        });
        return headers;
      }

      Object.keys(source).forEach(function (name) {
        var value = source[name];
        if (typeof value === "string") {
          headers[name] = value;
        } else if (value && typeof value.value === "string") {
          headers[name] = value.value;
        }
      });

      return headers;
    }

    function focalTweetIdOf(requestUrl) {
      try {
        var parsedUrl = new URL(requestUrl);
        var variables = parsedUrl.searchParams.get("variables");
        if (!variables) return "";
        var parsedVariables = JSON.parse(variables);
        return parsedVariables && parsedVariables.focalTweetId
          ? String(parsedVariables.focalTweetId)
          : "";
      } catch {
        return "";
      }
    }

    function finishWithError(message) {
      window.Reclaim.canExpectManyClaims(false);
      window.Reclaim.reportProviderError(message);
    }

    function requestViewerClaimWhenReady() {
      if (!replyRequestSeen || !viewerRequest || viewerClaimStarted) return;
      viewerClaimStarted = true;

      if (reloadTimer) {
        window.clearTimeout(reloadTimer);
        reloadTimer = null;
      }

      window.Reclaim.requestClaim({
        url: viewerRequest.url,
        method: "GET",
        headers: viewerRequest.headers,
        credentials: "include",
        responseMatches: [
          {
            value: "\"screen_name\":\"{{viewer_screen_name}}\"",
            type: "contains",
            isOptional: false,
          },
        ],
        responseRedactions: [
          {
            jsonPath: "$.screen_name",
            regex: "\"screen_name\":\"(.*)\"",
          },
        ],
      })
        .then(function (claimId) {
          if (!claimId) {
            throw new Error("The authenticated viewer claim was not created.");
          }

          sessionStorage.removeItem(reloadKey);
          log("info", "Early: authenticated viewer and reply requests are ready.");
          window.Reclaim.canExpectManyClaims(false);
          window.Reclaim.requiresUserInteraction(false);
        })
        .catch(function () {
          finishWithError(
            "Early could not verify the authenticated X account. Please start again."
          );
        });
    }

    function waitForViewerRequestOrReload() {
      if (viewerRequest || reloadTimer) return;

      reloadTimer = window.setTimeout(function () {
        reloadTimer = null;
        if (viewerRequest) {
          requestViewerClaimWhenReady();
          return;
        }

        if (!sessionStorage.getItem(reloadKey)) {
          sessionStorage.setItem(reloadKey, "1");
          window.location.reload();
          return;
        }

        finishWithError(
          "Early could not observe the authenticated X account request. Please start again."
        );
      }, 8000);
    }

    window.Reclaim.requiresUserInteraction(true);
    window.Reclaim.canExpectManyClaims(true);
    log("info", "Early: open your own reply under the target post.");

    window.reclaimInterceptor.addResponseMiddleware(
      async function (response, request) {
        try {
          var requestUrl = requestUrlOf(request);

          if (requestUrl.indexOf("/1.1/account/settings.json") !== -1) {
            viewerRequest = {
              url: requestUrl,
              headers: requestHeadersOf(request),
            };
            requestViewerClaimWhenReady();
            return response;
          }

          if (requestUrl.indexOf("/TweetDetail?") === -1) return response;

          var focalTweetId = focalTweetIdOf(requestUrl);
          var parameters = window.Reclaim.parameters || {};
          var parentTweetId = String(
            parameters.focalTweetId || parameters.tweetId || ""
          );

          if (!focalTweetId) return response;
          if (parentTweetId && focalTweetId === parentTweetId) return response;

          replyRequestSeen = true;
          requestViewerClaimWhenReady();
          waitForViewerRequestOrReload();
        } catch {
          log("error", "Early: could not inspect an X verification request.");
        }

        return response;
      },
      "early-reply-and-viewer-v103"
    );
  }

  boot();
})();
