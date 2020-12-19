import { Metric } from './metric.js';
import { CRUX_API_KEY } from './secrets.js';


export class CrUX {

  static load(pageUrl) {
    const urlHelper = new URL(pageUrl);
    const url = urlHelper.href;
    const origin = urlHelper.origin;

    return CrUX.query({url}).catch(e =>{
      console.warn('[Web Vitals] CrUX data unavailable', e);
      // If URL data is unavailable, fall back to the origin.
      return CrUX.query({origin});
    });
  }

  static query(request) {
    const ENDPOINT = `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${CRUX_API_KEY}`;
    return fetch(ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(request)
    }).then(response => {
      return response.json();
    }).then(response => {
      if (response.error) {
        return Promise.reject(response);
      }

      return response;
    });
  }

  static isOriginFallback(response) {
    return CrUX.getOrigin(response) !== undefined;
  }

  static getOrigin(response) {
    return response.record.key.origin;
  }

  static getNormalizedUrl(response) {
    return response?.urlNormalizationDetails?.normalizedUrl;
  }

  static getMetrics(response) {
    return Object.entries(response.record.metrics).map(([metricName, data]) => {
      return {
        id: Metric.mapCruxNameToId(metricName),
        data
      };
    });
  }

  static getDistribution(data) {
    return data.histogram.map(({density}) => density);
  }

}
