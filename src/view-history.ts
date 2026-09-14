import {decodeView,encodeView,type ViewState} from './view-link';

/** A small session history of deliberate navigation, independent of tour Prev.
 * Store the validated link grammar so later camera mutations cannot alter it. */
export class ViewHistory{
  private views:string[]=[];
  constructor(private readonly limit=32){}
  remember(view:ViewState){
    const hash=encodeView(view);if(!hash||hash===this.views.at(-1))return;
    this.views.push(hash);if(this.views.length>this.limit)this.views.shift();
  }
  available(current:ViewState){const hash=encodeView(current);return this.views.some(view=>view!==hash)}
  back(current:ViewState):ViewState|null{
    const hash=encodeView(current);
    while(this.views.length){const previous=this.views.pop()!;if(previous!==hash)return decodeView(previous)}
    return null;
  }
}
