import { Metric } from './metric.js';

// This key only works from the Web Vitals extension.
const CRUX_API_KEY = 'AIzaSyCZKhcAeiqGCp34891LPqVteT5kUMMq1og';


export class CrUX {

  static load(pageUrl) {
    const urlHelper = new URL(pageUrl);
    const url = urlHelper.href;
    const origin = urlHelper.origin;

    return CrUX.query({url}).catch(e =>{
      console.warn('CrUX URL data unavailable', e);
      // If URL data is unavailable, fall back to the origin.
      return CrUX.query({origin});
    });
  }

  static query(request) {
    request.formFactor = 'DESKTOP';
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
    return data.histogram.map(({density}) => density || 0);
  }

}
