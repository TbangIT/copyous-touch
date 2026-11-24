import GObject from 'gi://GObject';

import { __decorate } from '../../thirdparty/tslib.js';

let gtypeCounter = 0;
const sessionSeed = Math.random().toString(36).slice(2, 7);

/**
 * GObject.registerClass wrapper for use with decorators
 */
export function registerClass(options) {
	const opts = options ? { ...options } : {};
	return (cls) => {
		if (!opts.GTypeName) {
			opts.GTypeName = `CopiousTouch_${cls.name || 'Class'}_${sessionSeed}_${++gtypeCounter}`;
		}
		GObject.registerClass(opts, cls);
	};
}

let JsObjectWrapper = class JsObjectWrapper extends GObject.Object {
	jsobject;

	constructor(jsobject) {
		super();
		this.jsobject = jsobject;
	}
};
JsObjectWrapper = __decorate(
	[
		registerClass({
			Properties: {
				jsobject: GObject.ParamSpec.jsobject('jsobject', null, null, GObject.ParamFlags.READABLE),
			},
		}),
	],
	JsObjectWrapper,
);

export { JsObjectWrapper };

export function int32ParamSpec(name, flags, defaultValue) {
	return GObject.ParamSpec.int(name, null, null, flags, 0, 2147483647, defaultValue);
}

export function enumParamSpec(name, flags, e, defaultValue) {
	const values = Object.values(e)
		.map((k) => +k)
		.filter((k) => Number.isInteger(k));
	const min = Math.min(...values);
	const max = Math.max(...values);
	return GObject.ParamSpec.int(name, null, null, flags, min, max, defaultValue);
}

export function flagsParamSpec(name, flags, e, defaultValue) {
	const values = Object.values(e)
		.map((k) => +k)
		.filter((k) => Number.isInteger(k));
	const max = (2 << Math.log2(Math.floor(Math.max(...values)))) - 1;
	return GObject.ParamSpec.int(name, null, null, flags, 0, max, defaultValue);
}
