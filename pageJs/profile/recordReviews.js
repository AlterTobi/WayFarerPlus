(function() {
  const infoWindow = new google.maps.InfoWindow({
    content: "Loading..."
  });
  let markers = [];

  const getReviews = () => {
    const currentItemsText = localStorage.getItem("wfpSaved") || "[]";
    const currentItems = JSON.parse(currentItemsText);
    return currentItems;
  };

  const clearLocalStorage = () => {
    const confirmation = confirm(
      "This will delete all your review history! Are you sure?"
    );
    if (confirmation) {
      localStorage.removeItem("wfpSaved");
      window.location.reload();
    }
  };

  const saveReview = (pageData, submitData) => {
    if (nSubCtrl.reviewType !== "NEW") {
      console.log("Not a new review. Skipping the save.");
      return;
    }

    const {
      title,
      description,
      imageUrl,
      lat,
      lng,
      statement,
      supportingImageUrl
    } = pageData;
    const toSave = {
      title,
      description,
      imageUrl,
      lat,
      lng,
      statement,
      supportingImageUrl,
      ts: +new Date(),
      review: submitData
    };

    const currentItems = getReviews();
    const lastItem = currentItems.length
      ? currentItems[currentItems.length - 1]
      : null;
    const isSameReview = lastItem && lastItem.imageUrl === imageUrl;
    if (isSameReview) {
      // update the result
      currentItems[currentItems.length - 1] = toSave;
    } else {
      // push the new result
      currentItems.push(toSave);
    }
    localStorage.setItem("wfpSaved", JSON.stringify(currentItems));
  };

  const formatTs = ts => {
    const date = new Date(ts);
    const dateTimeFormat = new Intl.DateTimeFormat("default", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric"
    });
    return dateTimeFormat.format(date);
  };

  const buildLine = ({ ts, accepted, title, review }, index, coll) => {
    const formattedDate = formatTs(ts);
    let quality = "";
    let moreInfo = "";

    if (review === "skipped") {
      quality = "Skipped";
    } else if (!review) {
      // Latest result without a review will count as pending
      quality = (index === coll.length - 1) ? "Pending" : "Expired";
    } else if (review.quality) {
      // was not a reject
      quality = review.quality;
    } else if (review.spam) {
      // was a reject
      quality = 1;
      moreInfo = `(${review.rejectReason})`;
    }

    return `
    <tr class="${accepted ? 'success' : ''}">
        <td>${formattedDate}</td>
        <td>${quality}${moreInfo}</td>
        <td>${title}</td>
        <td class="text-center focus-map" data-index="${index}" style="cursor:pointer" title="Focus in map">📍</td>
        <td class="text-center toggle" data-index="${index}" style="cursor:pointer" title="Save as Accepted">✅</td>
    </tr>
    `;
  };

  function buildMap(reviewList, mapElement) {
    const mapSettings = settings["ctrlessZoom"]
      ? { scrollwheel: true, gestureHandling: "greedy" }
      : {};
    const gmap = new google.maps.Map(mapElement, {
      zoom: 8,
      ...mapSettings
    });

    const bounds = new google.maps.LatLngBounds();
    const gradedColors = [
      "#888888",
      "#ff3d00",
      "#ff8e01",
      "#fece00",
      "#8ac51f",
      "#00803b"
    ];

    markers = reviewList.map(review => {
      const latLng = {
        lat: review.lat,
        lng: review.lng
      };
      const reviewPoints = review.review || { quality: 0 };
      const quality = reviewPoints.quality === "" ? 1 : 0; // Rejected have quality at 0
      const marker = new google.maps.Marker({
        map: gmap,
        position: latLng,
        title: review.title,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8.5,
          fillColor: gradedColors[quality],
          fillOpacity: 0.8,
          strokeWeight: 0.4
        }
      });

      marker.addListener("click", () => {
        infoWindow.open(gmap, marker);
        infoWindow.setContent(buildInfoWindowContent(review));
      });

      bounds.extend(latLng);
      return marker;
    });

    const markerClusterer = new MarkerClusterer(gmap, markers, {
      imagePath:
        "https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/m",
      gridSize: 30,
      zoomOnClick: true,
      maxZoom: 10
    });
    gmap.fitBounds(bounds);
    return gmap;
  }

  const downloadObjectAsJson = (exportObj, exportName) => {
    var dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(exportObj));
    var downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", exportName);
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const formatAsGeojson = reviews => {
    return {
      type: "FeatureCollection",
      features: reviews.map(review => {
        const { lat, lng, ...props } = review;
        return {
          properties: {
            ...props
          },
          geometry: {
            coordinates: [lng, lat],
            type: "Point"
          },
          type: "Feature"
        };
      })
    };
  };

  const getReviewData = reviewData =>
    typeof reviewData === "object" ? reviewData : {};

  const getDD = (term, definition) =>
    definition ? `<dt>${term}</dt><dd>${definition}</dd>` : "";

  const getScores = ({ review }) => {
    if (!review || typeof review === "string") {
      return "";
    }
    return `
    <table class="table table-condensed">
      <thead>
          <tr>
              <th>Score</th>
              <th>Title</th>
              <th>Cultural</th>
              <th>Unique</th>
              <th>Safety</th>
              <th>Location</th>
          </tr>
      </thead>
      <tbody id="review-list">
        <tr>
          <td>${review.quality}</td>
          <td>${review.description}</td>
          <td>${review.cultural}</td>
          <td>${review.uniqueness}</td>
          <td>${review.safety}</td>
          <td>${review.location}</td>
        </tr>
      </tbody>
    </table>
`;
  };
  const buildInfoWindowContent = review => {
    const {
      title,
      imageUrl,
      description,
      statement,
      supportingImageUrl,
      lat,
      lng
    } = review;
    const { comment, newLocation, quality, spam, rejectReason } = getReviewData(
      review.review
    );
    const score = spam ? 1 : quality || 0;
    const scoreString = Array(5)
      .fill(0)
      .map((_, i) => (i + 1 <= score ? "★" : "☆"))
      .join("");
    const status = review.review === "skipped" ? "Skipped" : "Pending";

    return `<div class="panel panel-default">
    <div class="panel-heading">${title} <div class="pull-right star-red-orange">${
      score ? scoreString : status
    }</div></div>
    <div class="panel-body">
        <div class="row">
          <div class="col-xs-4"><a target="_blank" href="${imageUrl}=s0"><img style="max-width: 100%" src="${imageUrl}" class="img-responsive" alt="${title}"></a></div>
          <div class="col-xs-8">
            <dl class="dl-horizontal">
              ${getDD("Title", title)}
              ${getDD("Description", description)}
              ${getDD("Statement", statement)}
              ${getDD("Comment", comment)}
              ${getDD("New Location", newLocation)}
              ${getDD("Reject Reason", rejectReason)}
              ${getDD(
                "Supporting Image",
                supportingImageUrl &&
                  `<a target="_blank" href="${supportingImageUrl}=s0">View</a>`
              )}
              ${getDD("Location", `<a target="_blank" rel="noreferrer" href="https://intel.ingress.com/intel?ll=${lat},${lng}&z=21">Open in Intel</a>`)}
            </dl>
            ${getScores(review)}
          </div>
        </div>
      </div>
  </div>`;
  };

  const showEvaluated = () => {
    const reviews = getReviews();

    if (!reviews.length) return;
    const profileStats = document.getElementById("profile-main-contain");
    profileStats.insertAdjacentHTML(
      "beforeend",
      `
        <div class="container">
            <h3>Reviewed</h3>
            <div id="reviewed-map" style="height:400px"></div>
            <div class="table-responsive" style="margin-top:1rem">
              <table class="table table-striped table-condensed">
                  <thead>
                      <tr>
                          <th>Date</th>
                          <th>Score</th>
                          <th>Title</th>
                          <th>Location</th>
                          <th>Accepted</th>
                      </tr>
                  </thead>
                  <tbody id="review-list">
                      ${reviews
                        .map(buildLine)
                        .reverse()
                        .join("")}
                  </tbody>
              </table>
            </div>
            <button class="button-secondary" id="export-geojson">Export GeoJSON</button>
            <button class="button-secondary" id="clean-history">Clean History</button>
        </div>`
    );
    const map = buildMap(reviews, document.getElementById("reviewed-map"));
    const reviewListElement = document.getElementById("review-list");
    const exportButton = document.getElementById("export-geojson");
    const cleanHistoryButton = document.getElementById("clean-history");

    exportButton.addEventListener("click", () => {
      const geoJson = formatAsGeojson(reviews);
      downloadObjectAsJson(geoJson, "reviews.geojson");
    });

    cleanHistoryButton.addEventListener("click", clearLocalStorage);

    reviewListElement.addEventListener("click", ({ target }) => {
      const index = target.dataset && target.dataset.index;
      if (!index) {
        return;
      }

      const clickOnAccepted = target.classList.contains('toggle');

      if(clickOnAccepted) {
        const currentItems = getReviews();
        currentItems[index].accepted = !currentItems[index].accepted;
        localStorage.setItem("wfpSaved", JSON.stringify(currentItems));
        window.location.reload();
      } else {
        const currentMarker = markers[index];
        const currentReview = reviews[index];
  
        infoWindow.open(map, currentMarker);
        infoWindow.setContent(buildInfoWindowContent(currentReview));
        map.setZoom(12);
        map.panTo({ lat: currentReview.lat, lng: currentReview.lng });
      }

    });
  };

  document.addEventListener("WFPAllRevHooked", () => saveReview(nSubCtrl.pageData, false));
  document.addEventListener("WFPPCtrlHooked", showEvaluated);
  document.addEventListener("WFPAnsCtrlHooked", () => {
    const {
      submitForm,
      skipToNext,
      showLowQualityModal,
      markDuplicate
    } = ansCtrl;

    ansCtrl.submitForm = function() {
      // This only works for accepts
      submitForm();
      saveReview(nSubCtrl.pageData, ansCtrl.formData);
    };

    ansCtrl.showLowQualityModal = function() {
      showLowQualityModal();
      setTimeout(() => {
        const ansCtrl2Elem = document.getElementById("low-quality-modal");
        const ansCtrl2 = angular.element(ansCtrl2Elem).scope().answerCtrl2;
        const oldConfirm = ansCtrl2.confirmLowQuality;
        ansCtrl2.confirmLowQuality = function() {
          oldConfirm();
          saveReview(nSubCtrl.pageData, ansCtrl2.formData);
        };
      }, 10);
    };

    ansCtrl.markDuplicate = function(id) {
      // TODO. Need to find a duplicate to test this first!
      debugger;
      markDuplicate(id);
      saveReview(nSubCtrl.pageData, ansCtrl.formData);
    };
    ansCtrl.skipToNext = function() {
      saveReview(nSubCtrl.pageData, "skipped");
      skipToNext();
    };
  });
})();
