class Metric {
  
  constructor({id, name, local, finalized, thresholds}) {
    this.id = id;
    this.name = name;
    this.local = local;
    this.finalized = finalized;
    this.thresholds = thresholds;
    this.digitsOfPrecision = 3;
  }

  formatValue(value) {
    return value;
  }

  getAssessment(value) {
    if (!this.thresholds) {
      console.warn('Unable to assess', this, '(no thresholds)');
      return undefined;
    }

    let assessment = 'needs-improvement';
    if (value < this.thresholds.good) {
      assessment = 'good';
    } else if (value >= this.thresholds.poor) {
      assessment = 'poor';
    }

    return assessment;
  }

  getRelativePosition(value) {
    if (!this.thresholds) {
      console.warn('Unable to position local value', this, '(no thresholds)');
      return '0%';
    }

    // TODO: Position relative to field distribution, if available.
    // For now assume 33/33/33.
    const distribution = [0.33, 0.33, 0.33];
    const {good, poor} = this.thresholds;
    let pct = 0;
    if (value < good) {
      pct = value * distribution[0] / good;
    } else if (value >= poor) {
      // The poor bucket is unbounded, but for positioning purposes we'll
      // consider the rightmost edge to be a multiple of the poor threshold.
      pct = Math.min(0.95, (value - poor) / (poor * 2.5)) * distribution[2] + distribution[0] + distribution[1];
    } else {
      pct = (value - good) * distribution[1] / (poor - good) + distribution[0];
    }

    return `${pct * 100}%`;
  }

  toLocaleFixed({value, unit}) {
    return value.toLocaleString(undefined, {
      style: unit && 'unit',
      unit,
      unitDisplay: 'narrow',
      minimumFractionDigits: this.digitsOfPrecision,
      maximumFractionDigits: this.digitsOfPrecision
    });
  }

}

export class LCP extends Metric {

  constructor({local, finalized}) {
    const thresholds = {
      good: 2500,
      poor: 4000
    };

    super({
      id: 'lcp',
      name: 'Largest Contentful Paint',
      local,
      finalized,
      thresholds
    });
  }

  formatValue(value) {
    value /= 1000;
    return this.toLocaleFixed({
      value,
      unit: 'second'
    });
  }

}

export class FID extends Metric {

  constructor({local, finalized}) {
    const thresholds = {
      good: 100,
      poor: 300
    };

    super({
      id: 'fid',
      name: 'First Input Delay',
      local,
      finalized,
      thresholds
    });
  }

  formatValue(value) {
    if (!this.finalized) {
      return 'Waiting for input…';
    }

    return this.toLocaleFixed({
      value,
      unit: 'millisecond'
    });
  }

  getAssessment(value) {
    if (!this.finalized) {
      return;
    }

    return super.getAssessment(value);
  }

}

export class CLS extends Metric {

  constructor({local, finalized}) {
    const thresholds = {
      good: 0.10,
      poor: 0.25
    };

    super({
      id: 'cls',
      name: 'Cumulative Layout Shift',
      local,
      finalized,
      thresholds
    });
  }

  formatValue(value) {
    return this.toLocaleFixed({value});
  }

}