var map;
var drawToolbar;
var aoiSymbol;
var cellSymbol;

var aoiGraphicsLayer;

var defaultHexagonRadius1 = 200;
var defaultFishnetSize1 = 400;
var defaultHexagonRadius2 = 10;
var defaultFishnetSize2 = 20;

var maxSliderValue1 = 1000;
var maxSliderValue2 = 100;

var tessellationLayer;
var tessellationInfo = {
    hexagonRadius: defaultHexagonRadius1,
    hexagonOrientation:"NS", //  "EW" or "NS"
    fishnetSize: defaultFishnetSize1,
    type:"hexagon",
    origin:{x:0, y:0}
};

var pointFeatureLayer;
var selectedUnits;
var selectedUnitsLabel;

var currentSelectedRenderingFieldName;
var currentSelectedField;
var currentSelectedSummaryType;

var summaryFieldAndTypeData;
var summaryFieldAndTypeDataStore;
var summaryFieldAndTypeGrid;

var removeEmptyCells = false;
var removeCellBoundary = false;

var renderingFieldDataArray;
var renderingFieldStore;
var renderingFieldComboBox;

require([
    "esri/map", "esri/dijit/BasemapGallery", "esri/arcgis/utils",
    "dojo/parser", "dijit/form/Button",  "dijit/registry",
    "esri/geometry/Polygon",  "esri/graphic",  "esri/tasks/QueryTask",  "esri/tasks/query",
    "esri/symbols/SimpleFillSymbol", "esri/symbols/SimpleLineSymbol", "esri/Color",  "esri/geometry/Point","esri/geometry/mathUtils",
    "esri/toolbars/draw", "dijit/form/HorizontalSlider","esri/layers/GraphicsLayer", "esri/layers/FeatureLayer",

    "dojo/store/Memory", "dijit/form/ComboBox","dojox/grid/DataGrid","dojo/data/ObjectStore", "dijit/form/CheckBox","dijit/form/FilteringSelect",
    "esri/dijit/Legend", "esri/InfoTemplate",

    "dijit/layout/BorderContainer", "dijit/layout/ContentPane", "dijit/TitlePane", "dijit/layout/AccordionContainer", "dijit/form/RadioButton",
    "dojo/domReady!"
], function(
    Map, BasemapGallery, arcgisUtils,
    parser, Button,registry, Polygon, Graphic, QueryTask, Query,
    SimpleFillSymbol, SimpleLineSymbol, Color, Point, mathUtils,
    Draw,HorizontalSlider,GraphicsLayer, FeatureLayer,
    Memory, ComboBox, DataGrid, ObjectStore, CheckBox, FilteringSelect,
    Legend, InfoTemplate
    ) {
    parser.parse();

    var webmap = "4dc812d387514a72a10823cd54b9f97c";   // DC Crime data by Flora
    //webmap = "2b1d69040e364d8884c6d289d8baf043"; // service requests
    webmap = "f2b82d67254a47efb3361a89712de42b"; // DC Crime data 2

    var wm = getQueryVariable("webmap");
    console.log(wm);
    if(wm) {
        webmap = wm;
    }

    arcgisUtils.createMap(webmap,"map").then(function(response){
        map = response.map;

        aoiGraphicsLayer = new GraphicsLayer();
        map.addLayer(aoiGraphicsLayer);

        initToolbar();

//        map.on("click", function(evt) {
//            console.log("map clicked.", evt);
//        });

        var layers = response.itemInfo.itemData.operationalLayers;
        dojo.forEach(layers,function(layer){
            console.log(layer);
            if(layer.layerObject) {
                var layerObject = layer.layerObject;
                if (layerObject.type === "Feature Layer" && layerObject.geometryType === 'esriGeometryPoint') {
                    pointFeatureLayer = layerObject;
                    return;
                }
            }
//            else if(layer.featureCollection){
//                var layers = layer.featureCollection.layers;
//                for(var i=0;i<layers.length;i++) {
//                    var layerObject = layers[i].layerObject;
//                    if (layerObject && layerObject.type === "Feature Layer" && layerObject.geometryType === 'esriGeometryPoint') {
//                        pointFeatureLayer = layerObject;
//                        return;
//                    }
//                }
//            }
        });

        var legendLayers = arcgisUtils.getLegendLayers(response);
        var legendDijit = new Legend({
            map: map,
            layerInfos: legendLayers
        },"legendDiv");
        legendDijit.startup();

        createTOC(legendLayers);

        if(pointFeatureLayer) {

            currentSelectedRenderingFieldName = "count";
            renderingFieldDataArray = [{name: "Count", id:"count"}];
            renderingFieldStore = new Memory({data:renderingFieldDataArray});
            renderingFieldComboBox = new FilteringSelect({
                id: "renderingFieldSelect",
                name: "field",
                value: currentSelectedRenderingFieldName,
                store: renderingFieldStore,
                onChange: function(item){
                    console.log("selected render field: " + this.value + "" , item);
                    currentSelectedRenderingFieldName = this.value;
                }
            }, "renderingFieldSelect");
            renderingFieldComboBox.startup();

            currentSelectedField = {name: "<None>", alias:"<None>", type:"<None>", id:0};
            var dataArray = [currentSelectedField];
            var idIndex = 0;
            for (var i=0; i<pointFeatureLayer.fields.length; i++) {
                var field = pointFeatureLayer.fields[i];
                if(field.type === 'esriFieldTypeInteger' || field.type === 'esriFieldTypeDouble' || field.type === 'esriFieldTypeString') {
                    dataArray.push({alias: field.alias, name: field.name, id:(++idIndex), type: field.type});
                }
            }
            //console.log(dataArray);

            var fieldStore = new Memory({data:dataArray});
            var comboBox = new FilteringSelect({
                id: "fieldSelect",
                name: "field",
                value: 0,
                store: fieldStore,
                onChange: function(field){
                    console.log("selected field: ", field,  this.item);
                    currentSelectedField = this.item;
                }
            }, "fieldSelect");
            comboBox.startup();
            console.log("field select: ", comboBox);

            var summaryTypeStore = new Memory({
                data:[
                    {name:"Summary", id:"Sum"},
                    {name:"Average", id:"Mean"},
                    {name:"Mode", id:"Mode"},
                    {name:"Smallest", id:"Min"},
                    {name:"Largest", id:"Max"}
                ]
            });

            currentSelectedSummaryType = "Summary";
            var summaryTypeComboBox = new ComboBox({
                id: "summaryTypeSelect",
                name: "type",
                value: currentSelectedSummaryType,
                store: summaryTypeStore,
                onChange: function(){
                    console.log("selected type: " + this.value);
                    currentSelectedSummaryType = this.value;
                }
            }, "summaryTypeSelect").startup();

            summaryFieldAndTypeData = [];
            summaryFieldAndTypeDataStore = new ObjectStore({ objectStore:new Memory({ data: summaryFieldAndTypeData }) });
            summaryFieldAndTypeGrid = new DataGrid({
                store: summaryFieldAndTypeDataStore,
                query: { id: "*" },
                queryOptions: {},
                structure: [
                    { name: "Field Name", field: "fieldName", width: "40%" },
                    { name: "Summary Type", field: "summaryType", width: "40%" }
                ]
            }, "summaryGrid");
            summaryFieldAndTypeGrid.startup();


            cellSymbol = new SimpleFillSymbol(SimpleFillSymbol.STYLE_SOLID,
                new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID,
                    new Color([255,0,0, 0.75]), 1),new Color([255,255,0,0.0])
            );

            aoiSymbol = new SimpleFillSymbol(SimpleFillSymbol.STYLE_SOLID,
                new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID,
                    new Color([0,0,255, 0.5]), 1),new Color([0,255,255,0.0])
            );


            createConvexHull();
        }


        var unitsStore = new Memory({
            data:[
                {name:"Meters", id:"Meters"},
                {name:"Kilometers", id:"Kilometers"},
                {name:"Miles", id:"Miles"},
                {name:"Feet", id:"Feet"}
            ]
        });

        selectedUnits = "Meters";
        selectedUnitsLabel = "Meters";
        var unitsComboBox = new ComboBox({
            id: "unitsSelect",
            name: "unit",
            value: selectedUnits,
            store: unitsStore,
            onChange: function(){
                console.log("selected unit: " + this.value);
                var maximumValue = maxSliderValue1;
                var defaultHValue = defaultHexagonRadius1;
                var defaultFValue = defaultFishnetSize1;
                selectedUnits = this.value;
                if(selectedUnits === "Meters") {
                    selectedUnitsLabel = "Meters";
                    maximumValue = maxSliderValue1;
                    defaultHValue = defaultHexagonRadius1;
                    defaultFValue = defaultFishnetSize1;
                }else if (selectedUnits === "Kilometers"){
                    selectedUnitsLabel = "KM";
                    maximumValue = maxSliderValue2;
                    defaultHValue = defaultHexagonRadius2;
                    defaultFValue = defaultFishnetSize2;
                }else if (selectedUnits === "Miles"){
                    selectedUnitsLabel = "Miles";
                    maximumValue = maxSliderValue2;
                    defaultHValue = defaultHexagonRadius2;
                    defaultFValue = defaultFishnetSize2;
                }else if (selectedUnits === "Feet"){
                    selectedUnitsLabel = "Ft";
                    maximumValue = maxSliderValue1;
                    defaultHValue = defaultHexagonRadius1;
                    defaultFValue = defaultFishnetSize1;
                }

                dojo.byId("hexagonRadius").innerHTML = "(" + tessellationInfo.hexagonRadius + " " +  selectedUnitsLabel + ")";
                dojo.byId("fishnetSize").innerHTML = "(" + tessellationInfo.fishnetSize + " " +  selectedUnitsLabel + ")";

                registry.byId("horizontalSlider").maximum = maximumValue;
                registry.byId("horizontalSlider").discreteValues = maximumValue+1;
                registry.byId("horizontalSlider").attr('value', defaultHValue);

                registry.byId("horizontalSlider2").maximum = maximumValue;
                registry.byId("horizontalSlider2").discreteValues = maximumValue+1;
                registry.byId("horizontalSlider2").attr('value', defaultFValue);

                dojo.byId("hexagonRadius").innerHTML = "(" + defaultHValue + " " +  selectedUnitsLabel + ")";
                tessellationInfo.hexagonRadius = defaultHValue;

                dojo.byId("fishnetSize").innerHTML = "(" + defaultFValue + " " +  selectedUnitsLabel + ")";
                tessellationInfo.fishnetSize = defaultFValue;
            }
        }, "unitsSelect").startup();

    });

    if(registry.byId("createHexagons")) {
        console.log("button: ", registry.byId("createHexagons"));

//        console.log(registry.byId("orientationRadioOne").focusNode.value);
//        console.log(registry.byId("orientationRadioTwo").checked);

        registry.byId("createHexagons").setAttribute('disabled', true);

        registry.byId("createHexagons").on("click", function (evt) {
            var orientation = registry.byId("orientationRadioTwo").checked?"EW":"NS";
            console.log("# of graphics: ", aoiGraphicsLayer.graphics.length, " " + orientation);
            if(orientation) {
                tessellationInfo.hexagonOrientation = orientation;
            }

            if(!tessellationLayer) {
                tessellationLayer = new GraphicsLayer();
                map.addLayer(tessellationLayer);
            }
            if(aoiGraphicsLayer.graphics.length === 1 && tessellationInfo.hexagonRadius > 0) {
                var polygon = aoiGraphicsLayer.graphics[0].geometry;
                if(polygon.type != 'polygon')return;

                var radius = tessellationInfo.hexagonRadius;
                if(selectedUnits === "Kilometers") {
                    radius = tessellationInfo.hexagonRadius * 1000;
                }else if (selectedUnits === "Miles") {
                    radius = tessellationInfo.hexagonRadius * 1609.34;
                }else if (selectedUnits === "Feet") {
                    radius = tessellationInfo.hexagonRadius * 0.3048;
                }

                tessellationLayer.clear();
                map.infoWindow.hide();

                if(tessellationInfo.hexagonOrientation === "NS") {
                    createHexagons1(polygon, tessellationLayer, radius);
                }else if (tessellationInfo.hexagonOrientation === "EW") {
                    createHexagons2(polygon, tessellationLayer, radius);
                }
                tessellationInfo.type = "hexagon";

                registry.byId("aggregateButton").setAttribute('disabled', false);
            }
        });
    }

    if(registry.byId("createFishnet")) {
        console.log("button: ", registry.byId("createFishnet"));

        registry.byId("createFishnet").setAttribute('disabled', true);

        registry.byId("createFishnet").on("click", function (evt) {
            console.log("# of graphics: ", aoiGraphicsLayer.graphics.length);
            if(!tessellationLayer) {
                tessellationLayer = new GraphicsLayer();
                map.addLayer(tessellationLayer);
            }
            if(aoiGraphicsLayer.graphics.length === 1 && tessellationInfo.fishnetSize > 0) {
                var polygon = aoiGraphicsLayer.graphics[0].geometry;
                if(polygon.type != 'polygon')return;

                var gridSize = tessellationInfo.fishnetSize;
                if(selectedUnits === "Kilometers") {
                    gridSize = tessellationInfo.fishnetSize * 1000;
                }else if (selectedUnits === "Miles") {
                    gridSize = tessellationInfo.fishnetSize * 1609.34;
                }else if (selectedUnits === "Feet") {
                    gridSize = tessellationInfo.fishnetSize * 0.3048;
                }

                tessellationLayer.clear();
                map.infoWindow.hide();

                createFishnet(polygon, tessellationLayer, gridSize);
                tessellationInfo.type = "fishnet";

                registry.byId("aggregateButton").setAttribute('disabled', false);
            }
        });
    }

    if(registry.byId("horizontalSlider")) {
        console.log("button: ", registry.byId("horizontalSlider"));
        registry.byId("horizontalSlider").on("change", function (value) {
            dojo.byId("hexagonRadius").innerHTML = "(" + value+ " " +  selectedUnitsLabel + ")";
            tessellationInfo.hexagonRadius = value;
        });
    }

    if(registry.byId("horizontalSlider2")) {
        console.log("button: ", registry.byId("horizontalSlider2"));
        registry.byId("horizontalSlider2").on("change", function (value) {
            dojo.byId("fishnetSize").innerHTML = "(" + value + " " +  selectedUnitsLabel + ")";
            tessellationInfo.fishnetSize = value;
        });
    }

    if(registry.byId("aggregateButton")) {
        console.log("button: ", registry.byId("aggregateButton"));

        registry.byId("aggregateButton").setAttribute('disabled', true);

        registry.byId("aggregateButton").on("click", function (evt) {
            if(aoiGraphicsLayer.graphics.length === 1 && tessellationLayer && tessellationLayer.graphics.length > 0) {
                if(tessellationInfo.type === 'hexagon') {
                    if(tessellationInfo.hexagonOrientation === "NS") {
                        aggregateDataWithHexagons1();
                    }else if (tessellationInfo.hexagonOrientation = "EW") {
                        aggregateDataWithHexagons2();
                    }
                } else if (tessellationInfo.type === 'fishnet') {
                    aggregateDataWithFishnet();
                }
            }
        });
    }

    if(registry.byId("removeEmptyCheck")) {
        console.log("check: ", registry.byId("removeEmptyCheck"));
        registry.byId("removeEmptyCheck").on("change", function (value) {
            console.log("removeEmptyCheck: "  + value);
            removeEmptyCells = value;
        });
    }

    if(registry.byId("removeBoundaryCheck")) {
        console.log("check: ", registry.byId("removeBoundaryCheck"));
        registry.byId("removeBoundaryCheck").on("change", function (value) {
            console.log("removeBoundaryCheck: "  + value);
            removeCellBoundary = value;
        });
    }

    if(registry.byId("addFieldButton")) {
        console.log("button: ", registry.byId("addFieldButton"));
        registry.byId("addFieldButton").on("click", function (evt) {
            console.log("addField: " , currentSelectedField);
            if(currentSelectedField && currentSelectedSummaryType) {
                if(currentSelectedField.name === "<None>")return;

                var found =false;
                for(var i=0; i<summaryFieldAndTypeData.length;i++) {
                    if(currentSelectedField.name === summaryFieldAndTypeData[i].fieldName) {
                        found = true;
                        break;
                    }
                }
                if(!found) {
                    var canAdd = false;
                    if (currentSelectedSummaryType === "Mode" && currentSelectedField.type != "esriFieldTypeDouble") {
                        canAdd = true;
                    }else if (currentSelectedField.type != "esriFieldTypeString"){
                        canAdd = true;
                    }

                    if(canAdd) {
                        summaryFieldAndTypeData.push({fieldName: currentSelectedField.name, fieldType: currentSelectedField.type, summaryType: currentSelectedSummaryType});
                        summaryFieldAndTypeGrid.store.close();
                        summaryFieldAndTypeGrid.setStore(summaryFieldAndTypeDataStore);

                        if(currentSelectedField.type != "esriFieldTypeString") {
                            renderingFieldDataArray.push({name: currentSelectedField.name, id: currentSelectedField.name});
                        }

                        if (tessellationLayer) {
                            tessellationLayer.clear();
                        }
                    }
                }
            }
        });
    }

    if(registry.byId("clearFieldsButton")) {
        console.log("button: ", registry.byId("clearFieldsButton"));
        registry.byId("clearFieldsButton").on("click", function (evt) {
            summaryFieldAndTypeData.splice(0,summaryFieldAndTypeData.length);
            summaryFieldAndTypeGrid.store.close();
            summaryFieldAndTypeGrid.setStore(summaryFieldAndTypeDataStore);

            currentSelectedRenderingFieldName = "count";
            renderingFieldDataArray.splice(1,renderingFieldDataArray.length-1);
            renderingFieldComboBox.set("item", {name: "Count", id:"count"});

            if(tessellationLayer) {
                tessellationLayer.clear();
            }
        });
    }

    if(registry.byId("clearGraphicsButton")) {
        console.log("button: ", registry.byId("clearGraphicsButton"));
        registry.byId("clearGraphicsButton").on("click", function (evt) {
            clearAll();
        });
    }

    if(registry.byId("convexHullPolygon")) {
        console.log("button: ", registry.byId("convexHullPolygon"));
        registry.byId("convexHullPolygon").on("click", function (evt) {
            clearAll();
            createConvexHull();
        });
    }

    function createConvexHull(){
        if(!pointFeatureLayer)return;

        var query = new Query();
        query.where = "1=1";
        query.outSpatialReference = map.spatialReference;
        query.returnGeometry = true;

        pointFeatureLayer.queryFeatures(query, function(results){
            console.log(results.features.length);
            if(results && results.features.length>0) {
                var convexHull = new ConvexHullGrahamScan();

                results.features.map(function(feature){
                    //console.log(feature);
                    if(feature.geometry) {
                        convexHull.addPoint(feature.geometry.x, feature.geometry.y);
                    }
                });
                var hullPoints = convexHull.getHull();
                var hullPointArray = [];

                hullPoints.map(function (item) {
                    hullPointArray.push([item.x, item.y]);
                });
                hullPointArray.push(hullPointArray[0]);
                console.log("# of points in convex hull: " + hullPointArray.length, hullPointArray);

                var polygon = new Polygon();
                polygon.addRing([[-180,-90],[-180,90],[180,90],[180,-90],[-180,-90]]);
                console.log(polygon);

                var hullPolygon = new Polygon(map.spatialReference);
                hullPolygon.addRing(hullPointArray);
                console.log(hullPolygon);

                var graphic = new Graphic(hullPolygon, aoiSymbol);
                aoiGraphicsLayer.clear();
                aoiGraphicsLayer.add(graphic);

                registry.byId("createHexagons").setAttribute('disabled', false);
                registry.byId("createFishnet").setAttribute('disabled', false);
            }
        });
    }

    function clearAll() {
        aoiGraphicsLayer.clear();
        if(tessellationLayer) {
            tessellationLayer.clear();
        }
        map.infoWindow.hide();
        registry.byId("createHexagons").setAttribute('disabled', true);
        registry.byId("aggregateButton").setAttribute('disabled', true);
        registry.byId("createFishnet").setAttribute('disabled', true);
    }

    function createTOC(legendLayers) {
        var divPrefix = "layer_";
        var count = 0;

        //add check boxes
        dojo.forEach(legendLayers,function(layer){
            var layerName = layer.title;
            console.log("layer name=" + layerName + " id=" + layer.layer.id);
            var checkBox = new dijit.form.CheckBox({
                name: "checkBox" + layer.layer.id,
                value: layer.layer.id,
                checked: layer.layer.visible,
                onChange: function(evt) {
                    var clayer = map.getLayer(this.value);
                    clayer.setVisibility(!clayer.visible);
                    this.checked = clayer.visible;
                }
            });

            //add the check box and label to the toc
            var divId1 = divPrefix + count;
            var divId2 = divId1 + "_88";
            var divId3 = divId1 + "_99";
            count++;
            console.log("divId1=" + divId1 + " id2=" + divId2 + " id3=" + divId3);

            var parentLayerNameContainer = "<div><div id='" + divId1 + "'/>";
            parentLayerNameContainer += "<div id='" + divId2 + "' style='display:block;'><div id='" + divId3 +  "'/> </div>";
            parentLayerNameContainer += "</div>";

            console.log("parentLayerNameContainer=>" + parentLayerNameContainer);
            dojo.place(parentLayerNameContainer,dojo.byId("toggle"),"after");

            dojo.place(checkBox.domNode,dojo.byId(divId1),"before");

            var label = '<a href="javaScript:showSubLayers('  + divId2 + ')">' + layerName + '<a></br>';
            dojo.place(label,checkBox.domNode,"after");

            // add sublsyers
            if(layer.layer.layerInfos) {
                var divSubPrefix = "sublayer_";
                var subcount = 0;

                var layerInfos = layer.layer.layerInfos;
                dojo.forEach(layerInfos,function(layerInfo){
                    var layerName2 = layerInfo.name;
                    console.log("sublayer name=" +  layerName2 + " id=" + layerInfo.id + " parent id=" + layer.layer.id);
                    var layerId2 = layer.layer.id + "_" + layerInfo.id;

                    var checkBox2 = new dijit.form.CheckBox({
                        name: "checkBox" + layerId2,
                        value: layerId2,
                        checked: layerInfo.defaultVisibility,
                        onChange: function(evt) {
                            var nameId = this.value.split("_");
                            var lyr = map.getLayer(nameId[0]);
                            var infos = lyr.layerInfos;
                            var visible = [];
                            console.log("sublayer " + this.value + " " + nameId[0] + " " + nameId[1] + " " + lyr.layerInfos);
                            //var checkItemId = "checkBox" + this.value;
                            //console.log(checkItemId + " checked=" + dojo.query(checkItemId));
                            dojo.forEach(infos,function(info){
                                if(nameId[1] == info.id)
                                {
                                    if(info.defaultVisibility==false) {
                                        visible.push(info.id);
                                    }
                                    info.defaultVisibility = !info.defaultVisibility;
                                }else{
                                    if(info.defaultVisibility==true)visible.push(info.id);
                                }
                            });

//                            console.log("# of sublayers=" + visible.length);
//                            for(var i=0;i<visible.length;i++){
//                                console.log("i=" + i + " " + visible[i]);
//                            }

                            var clayer = map.getLayer(nameId[0]);
                            if(visible.length>0) {
                                clayer.setVisibility(true);
                                lyr.setVisibleLayers(visible);
                            }else{
                                clayer.setVisibility(!clayer.visible);
                            }
                        }
                    });

                    var divId4 = divSubPrefix + subcount;
                    var divId5 = divId4 + "_99";
                    subcount++;

                    var tableContent = "<div id='" + divId4  + "' style='padding-left:30px'>";
                    tableContent += '<table cellpadding="0" cellpacing="0">';
                    tableContent += "<tbody>";
                    tableContent += '<tr><td valign="top" width="20">';
                    tableContent += '<div style="display:inline;width:17px;"><div id="'  + divId5 +  '"/></div>';
                    tableContent += '<td>' + layerName2 + '</td>';
                    tableContent += "</tbody>";
                    tableContent += "</table>";
                    tableContent += '</div>';

                    dojo.place(tableContent, dojo.byId(divId3), "after");
                    //add the check box and label to the toc
                    dojo.place(checkBox2.domNode,dojo.byId(divId5),"after");

                });
            }

        });
    }

    function createQuery() {
        var selPolygon = aoiGraphicsLayer.graphics[0].geometry;
        var query = new Query();
        query.returnGeometry = true;
        query.outSpatialReference = map.spatialReference;
        query.geometry = selPolygon;
        query.outFields = ["*"];
        return query;
    }

    function updateTessellationLayer(aggregateArray){
        var needProcessAttributes = (summaryFieldAndTypeData && summaryFieldAndTypeData.length>0);
        var maxWeight = 0;

        if(needProcessAttributes){
            for (var j1 = 0; j1 < aggregateArray.length; j1++) {
                for(var k1=0; k1<summaryFieldAndTypeData.length; k1++) {
                    if(summaryFieldAndTypeData[k1].summaryType === "Average") {
                        var value = aggregateArray[j1].attributes[summaryFieldAndTypeData[k1].fieldName];
                        aggregateArray[j1].attributes[summaryFieldAndTypeData[k1].fieldName] = value / aggregateArray[j1].attributes["count"];
                    }
                    if(summaryFieldAndTypeData[k1].summaryType === "Mode") {
                        var attr = aggregateArray[j1].attributes[summaryFieldAndTypeData[k1].fieldName]+"";
                        var attrArray = attr.split("|");
                        var modeValue  = attrArray[0];
                        if(attrArray.length>1) {
                            var attrMode = {};
                            for(var k12=0; k12<attrArray.length;k12++) {
                                if(attrMode[attrArray[k12]]){
                                    attrMode[attrArray[k12]] += 1;
                                }else{
                                    attrMode[attrArray[k12]] = 1;
                                }
                            }
                            if(attrArray.length>1) {
                                for (var k13 = 1; k13 < attrArray.length; k13++) {
                                    if(attrMode[attrArray[k13]] > attrMode[modeValue]) {
                                        modeValue = attrArray[k13];
                                    }
                                }
                            }
                            if(summaryFieldAndTypeData[k1].type === 'esriFieldTypeInteger') {
                                aggregateArray[j1].attributes[summaryFieldAndTypeData[k1].fieldName] = parseInt(modeValue);
                            }else {
                                aggregateArray[j1].attributes[summaryFieldAndTypeData[k1].fieldName] = modeValue;
                            }
                        }
                    }
                }

                if (aggregateArray[j1].attributes[currentSelectedRenderingFieldName] > maxWeight) {
                    maxWeight = aggregateArray[j1].attributes[currentSelectedRenderingFieldName];
                }
            }
        } else {
            for (var j2 = 0; j2 < aggregateArray.length; j2++) {
                if (aggregateArray[j2].attributes[currentSelectedRenderingFieldName] > maxWeight) {
                    maxWeight = aggregateArray[j2].attributes[currentSelectedRenderingFieldName];
                }
            }
        }

        for (var k=0; k<tessellationLayer.graphics.length; k++) {
            var found = false;
            for (var kk = 0;  kk< aggregateArray.length; kk++) {
                if (tessellationLayer.graphics[k].attributes["id"] === aggregateArray[kk].id ) {
                    tessellationLayer.graphics[k].attributes["count"] = aggregateArray[kk].attributes["count"];
                    if(needProcessAttributes) {
                        for(var k2=0;k2<summaryFieldAndTypeData.length;k2++) {
                            tessellationLayer.graphics[k].attributes[summaryFieldAndTypeData[k2].fieldName] = aggregateArray[kk].attributes[summaryFieldAndTypeData[k2].fieldName];
                        }
                    }
                    found = true;
                    break;
                }
            }

            var alpha = (tessellationLayer.graphics[k].attributes[currentSelectedRenderingFieldName] / maxWeight) * 0.8 + 0.1;
            var outline = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([0, 0, 0, 0.5]), 1);
            if(removeCellBoundary) {
                outline = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([255, 0, 0, 0.0]), 0.01);
            }
            tessellationLayer.graphics[k].symbol = new SimpleFillSymbol(SimpleFillSymbol.STYLE_SOLID, outline, new Color([255, 0, 0, alpha]));

        }
        console.log("max weight: " + maxWeight);


        if(removeEmptyCells) {
            var total = tessellationLayer.graphics.length;
            for (var k3=total-1; k3>=0; k3--) {
                if(tessellationLayer.graphics[k3].attributes["count"]===0) {
                    tessellationLayer.remove(tessellationLayer.graphics[k3]);
                }
//                else{
//                    console.log(tessellationLayer.graphics[k3]);
//                }
            }
        }

        tessellationLayer.redraw();
    }

    function aggregateDataWithFishnet() {
        pointFeatureLayer.queryFeatures(createQuery(), function(results){
            console.log("# of features: " + results.features.length);
            var aggregateArray = [];
            var col,row, point, id;
            var needProcessAttributes = (summaryFieldAndTypeData && summaryFieldAndTypeData.length>0);
            var feature;

            for (var i=0; i<results.features.length; i++) {
                feature = results.features[i];
                point = results.features[i].geometry;
                col = parseInt( (point.x - tessellationInfo.origin.x) / tessellationInfo.fishnetSize );
                row = parseInt( (point.y - tessellationInfo.origin.y) / tessellationInfo.fishnetSize );
                id = "ID-" + col + "-" + row;

                var record = undefined;
                for(var j=0; j<aggregateArray.length; j++) {
                    if(aggregateArray[j].id === id) {
                        aggregateArray[j].attributes["count"] = aggregateArray[j].attributes["count"]+1;
                        record = aggregateArray[j];
                        break;
                    }
                }
                var attrs = {};
                if(!record) {
                    if(needProcessAttributes) {
                        for(var ii=0; ii<summaryFieldAndTypeData.length; ii++) {
                            attrs[summaryFieldAndTypeData[ii].fieldName] = feature.attributes[summaryFieldAndTypeData[ii].fieldName];
                        }
                    }
                    aggregateArray.push({id:id, count:1, attributes:attrs});
                } else if(needProcessAttributes){
                    attrs = record.attributes;
                    for(var kk=0; kk<summaryFieldAndTypeData.length; kk++) {
                        var value1 = attrs[summaryFieldAndTypeData[kk].fieldName];
                        var value2 = feature.attributes[summaryFieldAndTypeData[kk].fieldName];
                        if(summaryFieldAndTypeData[kk].summaryType === "Summary" || summaryFieldAndTypeData[kk].summaryType === "Average") {
                            attrs[summaryFieldAndTypeData[kk].fieldName] = value1 + value2;
                        }
                        else if (summaryFieldAndTypeData[kk].summaryType === "Smallest") {
                            if (value2 < value1) {
                                attrs[summaryFieldAndTypeData[kk].fieldName] = value2;
                            }
                        }
                        else if (summaryFieldAndTypeData[kk].summaryType === "Largest") {
                            if (value2 > value1) {
                                attrs[summaryFieldAndTypeData[kk].fieldName] = value2;
                            }
                        }
                        else if (summaryFieldAndTypeData[kk].summaryType === "Mode") {
                            attrs[summaryFieldAndTypeData[kk].fieldName] = value1 + "|" + value2;
                        }
                    }
                }
            }
            console.log("# of grids: " + aggregateArray.length);

            updateTessellationLayer(aggregateArray);
        });
    }

    function aggregateDataWithHexagons1() {
        pointFeatureLayer.queryFeatures(createQuery(), function(results){
            console.log("# of features: " + results.features.length);

            var startTime = (new Date().getTime());
            var aggregateArray = [];
            var col,row, point, id;
            var feature;

            var halfEdgeLength = tessellationInfo.hexagonRadius * 0.5;
            var halfHexagonHeight = tessellationInfo.hexagonRadius * Math.cos(Math.PI * (30.0/180));
            var hexagonHeight =  halfHexagonHeight * 2;

            var colWidth = tessellationInfo.hexagonRadius + halfEdgeLength;
            var needProcessAttributes = (summaryFieldAndTypeData && summaryFieldAndTypeData.length>0);

            for (var i=0; i<results.features.length; i++) {
                feature = results.features[i];
                point = feature.geometry;
                col = parseInt( (point.x - tessellationInfo.origin.x) / colWidth );
                row = parseInt( (point.y - tessellationInfo.origin.y) / hexagonHeight );


                var center1, center2, center3;
                var evenCol = col % 2;
                if(evenCol===0) {
                    center1 = {x:col*colWidth + tessellationInfo.origin.x, y:row*hexagonHeight + tessellationInfo.origin.y};
                    center2 = {x:col*colWidth + tessellationInfo.origin.x, y:(row+1)*hexagonHeight + tessellationInfo.origin.y};
                    center3 = {x:(col+1)*colWidth + tessellationInfo.origin.x, y:(row+0.5)*hexagonHeight + tessellationInfo.origin.y};
                }else{
                    center1 = {x:col*colWidth + tessellationInfo.origin.x, y:(row+0.5)*hexagonHeight + tessellationInfo.origin.y};
                    center2 = {x:(col+1)*colWidth + tessellationInfo.origin.x, y:row*hexagonHeight + tessellationInfo.origin.y};
                    center3 = {x:(col+1)*colWidth + tessellationInfo.origin.x, y:(row+1)*hexagonHeight + tessellationInfo.origin.y};
                }

                var d1 = (point.x - center1.x)*(point.x - center1.x) + (point.y - center1.y)*(point.y - center1.y);
                var d2 = (point.x - center2.x)*(point.x - center2.x) + (point.y - center2.y)*(point.y - center2.y);
                var d3 = (point.x - center3.x)*(point.x - center3.x) + (point.y - center3.y)*(point.y - center3.y);

                if(evenCol===0) {
                    if (d1 <= d2 && d1 <= d3) {
                        id = "ID-" + col + "-" + row;
                    }
                    else if (d2 <= d1 && d2 <= d3) {
                        id = "ID-" + col + "-" + (row+1);
                    }
                    else {
                        id = "ID-" + (col+1) + "-" + row;
                    }
                }else {
                    if (d1 <= d2 && d1 <= d3) {
                        id = "ID-" + col + "-" + row;
                    }
                    else if (d2 <= d1 && d2 <= d3) {
                        id = "ID-" + (col+1) + "-" + row;
                    }
                    else {
                        id = "ID-" + (col+1) + "-" + (row+1);
                    }
                }
//                console.log("id: " + id +  " col:" + col + " row:" + row +  " col w: " + colWidth + " hexagon h: " + hexagonHeight + " d1: " + d1  + " d2: " + d2 + " d3: " + d3);
//                console.log("center1: ", center1);
//                console.log("center2: ", center2);
//                console.log("center3: ", center3);
//                console.log("point  : ", point, results.features[i].attributes["NID"]);

                var record = undefined;
                for(var j=0; j<aggregateArray.length; j++) {
                    if(aggregateArray[j].id === id) {
                        aggregateArray[j].attributes["count"] = aggregateArray[j].attributes["count"] + 1;
                        record = aggregateArray[j];
                        break;
                    }
                }

                var attrs = {};
                if(!record) {
                    attrs["count"] = 1;
                    if(needProcessAttributes) {
                        for(var ii=0; ii<summaryFieldAndTypeData.length; ii++) {
                            attrs[summaryFieldAndTypeData[ii].fieldName] = feature.attributes[summaryFieldAndTypeData[ii].fieldName];
                        }
                    }
                    record = {id:id, attributes:attrs};
                    aggregateArray.push(record);
                } else if(needProcessAttributes){
                    attrs = record.attributes;
                    for(var kk=0; kk<summaryFieldAndTypeData.length; kk++) {
                        var value1 = attrs[summaryFieldAndTypeData[kk].fieldName];
                        var value2 = feature.attributes[summaryFieldAndTypeData[kk].fieldName];
                        if(summaryFieldAndTypeData[kk].summaryType === "Summary" || summaryFieldAndTypeData[kk].summaryType === "Average") {
                            attrs[summaryFieldAndTypeData[kk].fieldName] = value1 + value2;
                        }
                        else if (summaryFieldAndTypeData[kk].summaryType === "Smallest") {
                            if (value2 < value1) {
                                attrs[summaryFieldAndTypeData[kk].fieldName] = value2;
                            }
                        }
                        else if (summaryFieldAndTypeData[kk].summaryType === "Largest") {
                            if (value2 > value1) {
                                attrs[summaryFieldAndTypeData[kk].fieldName] = value2;
                            }
                        }
                        else if (summaryFieldAndTypeData[kk].summaryType === "Mode") {
                            attrs[summaryFieldAndTypeData[kk].fieldName] = value1 + "|" + value2;
                        }
                        //console.log("mode: " + summaryFieldAndTypeData[kk].summaryType + " value1:", value1, " value2: ", value2, " combined: ", attrs[summaryFieldAndTypeData[kk].fieldName])
                    }
                }
                //console.log(record);
            }

            updateTessellationLayer(aggregateArray);

            var endTime = (new Date().getTime());
            console.log("# of grids: " + aggregateArray.length  + " elapsed time: " + (endTime-startTime)/1000 + " s");
            //console.log(aggregateArray);
        });
    }
    function aggregateDataWithHexagons2() {
        pointFeatureLayer.queryFeatures(createQuery(), function(results){
            console.log("# of features: " + results.features.length);

            var startTime = (new Date().getTime());
            var aggregateArray = [];
            var col,row, point, id;
            var feature;

            var halfEdgeLength = tessellationInfo.hexagonRadius * 0.5;
            var halfHexagonHeight = tessellationInfo.hexagonRadius * Math.cos(Math.PI * (30.0/180));
            var colWidth =  halfHexagonHeight * 2;
            var rowHeight = tessellationInfo.hexagonRadius + halfEdgeLength;
            var needProcessAttributes = (summaryFieldAndTypeData && summaryFieldAndTypeData.length>0);

            for (var i=0; i<results.features.length; i++) {
                feature = results.features[i];
                point = feature.geometry;
                col = parseInt( (point.x - tessellationInfo.origin.x) / colWidth );
                row = parseInt( (point.y - tessellationInfo.origin.y) / rowHeight );


                var center1, center2, center3;
                var evenRow = row % 2;
                if(evenRow===0) {
                    center1 = {x:col*colWidth + tessellationInfo.origin.x, y:row*rowHeight + tessellationInfo.origin.y};
                    center2 = {x:(col+0.5)*colWidth + tessellationInfo.origin.x, y:(row+1)*rowHeight + tessellationInfo.origin.y};
                    center3 = {x:(col+1)*colWidth + tessellationInfo.origin.x, y:row*rowHeight + tessellationInfo.origin.y};
                }else{
                    center1 = {x:(col+0.5)*colWidth + tessellationInfo.origin.x, y:row*rowHeight + tessellationInfo.origin.y};
                    center2 = {x:(col+1)*colWidth + tessellationInfo.origin.x, y:(row+1)*rowHeight + tessellationInfo.origin.y};
                    center3 = {x:col*colWidth + tessellationInfo.origin.x, y:(row+1)*rowHeight + tessellationInfo.origin.y};
                }

                var d1 = (point.x - center1.x)*(point.x - center1.x) + (point.y - center1.y)*(point.y - center1.y);
                var d2 = (point.x - center2.x)*(point.x - center2.x) + (point.y - center2.y)*(point.y - center2.y);
                var d3 = (point.x - center3.x)*(point.x - center3.x) + (point.y - center3.y)*(point.y - center3.y);

                if(evenRow===0) {
                    if (d1 <= d2 && d1 <= d3) {
                        id = "ID-" + col + "-" + row;
                    }
                    else if (d2 <= d1 && d2 <= d3) {
                        id = "ID-" + col + "-" + (row+1);
                    }
                    else {
                        id = "ID-" + (col+1) + "-" + row;
                    }
                }else {
                    if (d1 <= d2 && d1 <= d3) {
                        id = "ID-" + col + "-" + row;
                    }
                    else if (d2 <= d1 && d2 <= d3) {
                        id = "ID-" + (col+1) + "-" + (row+1);
                    }
                    else {
                        id = "ID-" +col + "-" + (row+1);
                    }
                }
//                console.log("id: " + id +  " col:" + col + " row:" + row +  " col w: " + colWidth + " hexagon h: " + hexagonHeight + " d1: " + d1  + " d2: " + d2 + " d3: " + d3);
//                console.log("center1: ", center1);
//                console.log("center2: ", center2);
//                console.log("center3: ", center3);
//                console.log("point  : ", point, results.features[i].attributes["NID"]);

                var record = undefined;
                for(var j=0; j<aggregateArray.length; j++) {
                    if(aggregateArray[j].id === id) {
                        aggregateArray[j].attributes["count"] = aggregateArray[j].attributes["count"]+1;
                        record = aggregateArray[j];
                        break;
                    }
                }

                var attrs = {};
                if(!record) {
                    if(needProcessAttributes) {
                        for(var ii=0; ii<summaryFieldAndTypeData.length; ii++) {
                            attrs[summaryFieldAndTypeData[ii].fieldName] = feature.attributes[summaryFieldAndTypeData[ii].fieldName];
                        }
                    }
                    aggregateArray.push({id:id, count:1, attributes:attrs});
                } else if(needProcessAttributes){
                    attrs = record.attributes;
                    for(var kk=0; kk<summaryFieldAndTypeData.length; kk++) {
                        var value1 = attrs[summaryFieldAndTypeData[kk].fieldName];
                        var value2 = feature.attributes[summaryFieldAndTypeData[kk].fieldName];
                        if(summaryFieldAndTypeData[kk].summaryType === "Summary" || summaryFieldAndTypeData[kk].summaryType === "Average") {
                            attrs[summaryFieldAndTypeData[kk].fieldName] = value1 + value2;
                        }
                        else if (summaryFieldAndTypeData[kk].summaryType === "Smallest") {
                            if (value2 < value1) {
                                attrs[summaryFieldAndTypeData[kk].fieldName] = value2;
                            }
                        }
                        else if (summaryFieldAndTypeData[kk].summaryType === "Largest") {
                            if (value2 > value1) {
                                attrs[summaryFieldAndTypeData[kk].fieldName] = value2;
                            }
                        } else if (summaryFieldAndTypeData[kk].summaryType === "Mode") {
                            attrs[summaryFieldAndTypeData[kk].fieldName] = value1 + "|" + value2;
                            console.log(value1, value2, attrs[summaryFieldAndTypeData[kk].fieldName])
                        }
                    }
                }
            }

            updateTessellationLayer(aggregateArray);

            var endTime = (new Date().getTime());
            console.log("# of grids: " + aggregateArray.length  + " elapsed time: " + (endTime-startTime)/1000 + " s");

        });
    }

    function initToolbar() {
        drawToolbar = new Draw(map);
        drawToolbar.on("draw-end", addGraphic);

        registry.byId("Polygon").on("click", function (evt) {
            setDrawTool("polygon");

        });
        registry.byId("FreehandPolygon").on("click", function (evt) {
            setDrawTool("freehandpolygon");
        });
    }

    function setDrawTool(tool) {
        map.disableMapNavigation();
        drawToolbar.activate(tool);
        clearAll();
    }

    function addGraphic(evt) {
        //deactivate the toolbar and clear existing graphics
        drawToolbar.deactivate();
        aoiGraphicsLayer.clear();
        map.enableMapNavigation();
        aoiGraphicsLayer.add(new Graphic(evt.geometry, aoiSymbol));

        registry.byId("createHexagons").setAttribute('disabled', false);
        registry.byId("createFishnet").setAttribute('disabled', false);
    }

    function createFishnet(polygon, graphicsLayer, size) {
        var extent = polygon.getExtent();

        tessellationInfo.origin.x = extent.xmin;
        tessellationInfo.origin.y = extent.ymin;

        var numRows = parseInt( (extent.ymax - extent.ymin) / size + 0.5);
        var numCols = parseInt( (extent.xmax - extent.xmin) / size + 0.5);

        console.log("rows: " + numRows + " cols: " + numCols + " ");
        var startTime = (new Date().getTime());
        var count1 = 0;
        var count2 = 0;
        var infoTemplate = new InfoTemplate("Attributes", "${*}");

        for(var c=0; c<numCols; c++) {
            for (var r=0; r<numRows; r++) {
                var centerX, centerY;

                centerX = c * size + extent.xmin;
                centerY = r * size + extent.ymin;

                var x1 = centerX;
                var y1 = centerY;
                var x2 = centerX + size;
                var y2 = centerY;
                var x3 = centerX + size;
                var y3 = centerY + size;
                var x4 = centerX;
                var y4 = centerY + size;


                var square = new Polygon(polygon.spatialReference);
                square.addRing([[x1,y1],[x2,y2],[x3,y3],[x4,y4],[x1,y1]]);

                var center = new Point(centerX, centerY, polygon.spatialReference);
                //console.log("c=" + c + " r=" + r + " even col:"  + evenCol + " center x: " + centerX + " y: " + centerY + " " + polygon.contains(center));

                if(!polygon.contains(center)) {
                    var overlap = ringOverlapWithPolygon(polygon, square);
                    if(!overlap)
                        continue;
                }

                var id = "ID-" + c + "-" + r;
                var attr = {"count":0, id:id};
                var needProcessAttributes = (summaryFieldAndTypeData && summaryFieldAndTypeData.length>0);
                if(needProcessAttributes) {
                    for(var k2=0;k2<summaryFieldAndTypeData.length;k2++) {
                        attr[summaryFieldAndTypeData[k2].fieldName] = 0;
                    }
                }

                var graphic = new Graphic(square, cellSymbol);
                graphic.setAttributes(attr);
                graphic.setInfoTemplate(infoTemplate);
                graphicsLayer.add(graphic);

            }
        }

        var endTime = (new Date().getTime());
        console.log("elapsed time: " + (endTime-startTime)/1000 + " s", " count1: " + count1 + " count2: " + count2);
    }

    function createHexagons1(polygon, graphicsLayer, radius) {
        var extent = polygon.getExtent();
        var halfEdgeLength = radius * 0.5;
        var halfHexagonHeight = radius * Math.cos(Math.PI * (30.0/180));
        var hexagonHeight =  halfHexagonHeight * 2;

        tessellationInfo.origin.x = extent.xmin;
        tessellationInfo.origin.y = extent.ymin;

        console.log(polygon, extent, radius);

        var numRows = parseInt( (extent.ymax - extent.ymin) / hexagonHeight + 0.5) + 1;
        var numCols = parseInt( (extent.xmax - extent.xmin) / (radius + halfEdgeLength) + 0.5) + 1;

        console.log("rows: " + numRows + " cols: " + numCols + " ");
        var startTime = (new Date().getTime());
        var count1 = 0;
        var count2 = 0;
        var infoTemplate = new InfoTemplate("Attributes", "${*}");

        for(var c=0; c<numCols; c++) {
            for (var r=0; r<numRows; r++) {
                var evenCol = c % 2;
                var centerX, centerY;

                if(evenCol==0) {
                    centerX = c * (radius + halfEdgeLength) + extent.xmin;
                    centerY = r * hexagonHeight + extent.ymin;
                } else {
                    centerX = c * (radius + halfEdgeLength) + extent.xmin;
                    centerY = r * hexagonHeight + halfHexagonHeight + extent.ymin;
                }

                var x1 = centerX + radius;
                var y1 = centerY;
                var x2 = centerX + halfEdgeLength;
                var y2 = centerY + halfHexagonHeight;
                var x3 = centerX - halfEdgeLength;
                var y3 = centerY + halfHexagonHeight;
                var x4 = centerX - radius;
                var y4 = centerY;
                var x5 = centerX - halfEdgeLength;
                var y5 = centerY - halfHexagonHeight;
                var x6 = centerX + halfEdgeLength;
                var y6 = centerY - halfHexagonHeight;

                var hexagon = new Polygon(polygon.spatialReference);
                hexagon.addRing([[x1,y1],[x2,y2],[x3,y3],[x4,y4],[x5,y5],[x6,y6],[x1,y1]]);

                var center = new Point(centerX, centerY, polygon.spatialReference);
                //console.log("c=" + c + " r=" + r + " even col:"  + evenCol + " center x: " + centerX + " y: " + centerY + " " + polygon.contains(center));

                if(!polygon.contains(center)) {
                    var overlap = ringOverlapWithPolygon(polygon, hexagon);
                    if(!overlap)
                        continue;
                }

                var id = "ID-" + c + "-" + r;
                var attr = {"count":0, id:id};
                var needProcessAttributes = (summaryFieldAndTypeData && summaryFieldAndTypeData.length>0);
                if(needProcessAttributes) {
                    for(var k2=0;k2<summaryFieldAndTypeData.length;k2++) {
                        attr[summaryFieldAndTypeData[k2].fieldName] = 0;
                    }
                }
                var graphic = new Graphic(hexagon, cellSymbol, attr);
                graphic.setInfoTemplate(infoTemplate);
                graphicsLayer.add(graphic);
            }
        }

        var endTime = (new Date().getTime());
        console.log("elapsed time: " + (endTime-startTime)/1000 + " s", " count1: " + count1 + " count2: " + count2);
    }
    function createHexagons2(polygon, graphicsLayer, radius) {
        var extent = polygon.getExtent();
        var halfEdgeLength = radius * 0.5;
        var halfHexagonHeight = radius * Math.cos(Math.PI * (30.0/180));
        var hexagonHeight =  halfHexagonHeight * 2;

        tessellationInfo.origin.x = extent.xmin;
        tessellationInfo.origin.y = extent.ymin;

        console.log(polygon, extent, radius);

        var numCols = parseInt( (extent.xmax - extent.xmin) / hexagonHeight + 0.5) + 1;
        var numRows = parseInt( (extent.ymax - extent.ymin) / (radius + halfEdgeLength) + 0.5) + 1;

        console.log("rows: " + numRows + " cols: " + numCols + " ");
        var startTime = (new Date().getTime());
        var count1 = 0;
        var count2 = 0;
        var infoTemplate = new InfoTemplate("Attributes", "${*}");

        for(var row=0; row<numRows; row++) {
            for (var col=0; col<numCols; col++) {
                var evenRow = row % 2;
                var centerX, centerY;

                if(evenRow==0) {
                    centerY = row * (radius + halfEdgeLength) + extent.ymin;
                    centerX = col * hexagonHeight + extent.xmin;
                } else {
                    centerY = row * (radius + halfEdgeLength) + extent.ymin;
                    centerX = col * hexagonHeight + halfHexagonHeight + extent.xmin;
                }

                var y1 = centerY + radius;
                var x1 = centerX;
                var y2 = centerY + halfEdgeLength;
                var x2 = centerX + halfHexagonHeight;
                var y3 = centerY - halfEdgeLength;
                var x3 = centerX + halfHexagonHeight;
                var y4 = centerY - radius;
                var x4 = centerX;
                var y5 = centerY - halfEdgeLength;
                var x5 = centerX - halfHexagonHeight;
                var y6 = centerY + halfEdgeLength;
                var x6 = centerX - halfHexagonHeight;

                var hexagon = new Polygon(polygon.spatialReference);
                hexagon.addRing([[x1,y1],[x2,y2],[x3,y3],[x4,y4],[x5,y5],[x6,y6],[x1,y1]]);

                var center = new Point(centerX, centerY, polygon.spatialReference);
                //console.log(" c=" + col + " r=" + row + " even row:"  + evenRow + " center x: " + centerX + " y: " + centerY + " " + polygon.contains(center));

                if(!polygon.contains(center)) {
                    var overlap = ringOverlapWithPolygon(polygon, hexagon);
                    if(!overlap)
                        continue;
                }

                var id = "ID-" + col + "-" + row;
                var attr = {"count":0, id:id};
                var needProcessAttributes = (summaryFieldAndTypeData && summaryFieldAndTypeData.length>0);
                if(needProcessAttributes) {
                    for(var k2=0;k2<summaryFieldAndTypeData.length;k2++) {
                        attr[summaryFieldAndTypeData[k2].fieldName] = 0;
                    }
                }
                var graphic = new Graphic(hexagon, cellSymbol, attr);
                graphic.setInfoTemplate(infoTemplate);
                graphicsLayer.add(graphic);

                //console.log(id + " c=" + col + " r=" + row + " even row:"  + evenRow + " center x: " + centerX + " y: " + centerY + " " + polygon.contains(center));

            }
        }

        var endTime = (new Date().getTime());
        console.log("elapsed time: " + (endTime-startTime)/1000 + " s", " count1: " + count1 + " count2: " + count2);
    }

    function ringOverlapWithPolygon(polygon, tessellationPolygon) {
        //console.log("check individual lines");

        var hexagonExtent = tessellationPolygon.getExtent();
        for (var i=0; i<polygon.rings.length; i++) {
            var ring = polygon.rings[i];
            for (var k = 0; k < ring.length - 1; k++) {
                var x1 = ring[k][0], y1 = ring[k][1];
                var x2 = ring[k+1][0], y2 = ring[k+1][1];

                if (! ( (Math.min(x1,x2) > hexagonExtent.xmax) || (Math.max(x1,x2) < hexagonExtent.xmin) ||
                    (Math.min(y1,y2) > hexagonExtent.ymax) || (Math.max(y1,y2) < hexagonExtent.ymin) ) )
                {
                    var line1start = new Point(x1,y1);
                    var line1end = new Point(x2,y2);
                    var ringH = tessellationPolygon.rings[0];
                    for (var j=0; j<ringH.length-1; j++) {
                        var line2start = new Point(ringH[j][0],ringH[j][1]);
                        var line2end =  new Point(ringH[j+1][0],ringH[j+1][1]);

                        //var intersectedPoint = mathUtils.getLineIntersection(line1start,line1end,line2start,line2end);    // problematic algorithm here
                        var intersectedPoint = getLineIntersection(line1start,line1end,line2start,line2end);    // problematic algorithm here
                        //console.log(intersectedPoint);
                        if(intersectedPoint){
                            var intersectedX1 = (intersectedPoint.x <= Math.max(line1start.x,line1end.x) && intersectedPoint.x >= Math.min(line1start.x,line1end.x));
                            var intersectedY1 = (intersectedPoint.y <= Math.max(line1start.y,line1end.y) && intersectedPoint.y >= Math.min(line1start.y,line1end.y));
                            var intersectedX2 = (intersectedPoint.x <= Math.max(line2start.x,line2end.x) && intersectedPoint.x >= Math.min(line2start.x,line2end.x));
                            var intersectedY2 = (intersectedPoint.y <= Math.max(line2start.y,line2end.y) && intersectedPoint.y >= Math.min(line2start.y,line2end.y));
                            if ( (intersectedX1 && intersectedY1) && (intersectedX2 && intersectedY2) ) return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    function getLineIntersection(line1start,line1end,line2start,line2end) {
        var x,y;
        if (line1start.x === line1end.x) {
            if (line2start.x === line2end.x) {
                if (line2start.x === line1start.x) {
                    var y1max = Math.max(line1start.y, line1end.y);
                    var y1min = Math.min(line1start.y, line1end.y);
                    var y2max = Math.max(line2start.y, line2end.y);
                    var y2min = Math.min(line2start.y, line2end.y);

                    if( y1max < y2min) {
                        return null;
                    } else if (y1min > y2max) {
                        return null;
                    } else {
                        if (line1start.y <= y2max && line1start.y >= y2min)
                            y = line1start.y;
                        else
                            y = line1end.y;
                        return new Point(line1start.x, y);
                    }
                }else {
                    return null;
                }
            }
            else if (line2start.y === line2end.y) {
                return new Point(line1start.x, line2start.y);
            }
            else {
                y = line2start.y +  (line2end.y - line2start.y) * (line1start.x - line2start.x) / (line2end.x - line2start.x);
                return  new Point(line1start.x, y);
            }
        }
        else if (line1start.y === line1end.y) {
            if (line2start.y === line2end.y) {
                if(line1start.y === line2start.y) {
                    var x1min = Math.min(line1start.x, line1end.x);
                    var x1max = Math.max(line1start.x, line1end.x);
                    var x2min = Math.min(line2start.x, line2end.x);
                    var x2max = Math.max(line2start.x, line2end.x);
                    if(x1max < x2min) {
                        return null;
                    } else if (x1min > x2max ) {
                        return null;
                    } else {
                        if (line1start.x <= x2max && line1start.x >= x2min)
                            x = line1start.x;
                        else
                            x = line1end.x;
                        return new Point(x, line1start.y);
                    }
                }else{
                    return null;
                }
            }
            else if (line2start.x === line2end.x) {
                return new Point(line2start.x, line1start.y);
            }
            else {
                x = line2start.x +  (line2end.x - line2start.x) * (line1start.y - line2start.y) / (line2end.y - line2start.y);
                return  new Point(x, line1start.y);
            }
        }
        else {
            if (line2start.x === line2end.x) {
                y = line1start.y +  (line1end.y - line1start.y) * (line2start.x - line1start.x) / (line1end.x - line1start.x);
                return  new Point(line2start.x, y);
            }
            else if (line2start.y === line2end.y) {
                x = line1start.x +  (line1end.x - line1start.x) * (line2start.y - line1start.y) / (line1end.y - line1start.y);
                return  new Point(x, line2start.y);
            }
            else {
                var dx1 = line1end.x - line1start.x;
                var dy1 = line1end.y - line1start.y;
                var dx2 = line2end.x - line2start.x;
                var dy2 = line2end.y - line2start.y;
                var xx = line1start.x * (dy1/dx1) - line1start.y + line2start.y - line2start.x * (dy2/dx2);
                x = xx / (dy1/dx1 - dy2/dx2);
                y = line2start.y +  (line2end.y - line2start.y) * (x - line2start.x) / (line2end.x - line2start.x);
                return  new Point(x, y);
            }
        }
    }

    function getQueryVariable(variable) {
        var query = window.location.search.substring(1);
        var vars = query.split('&');
        for (var i = 0; i < vars.length; i++) {
            var pair = vars[i].split('=');
            if (decodeURIComponent(pair[0]) == variable) {
                return decodeURIComponent(pair[1]);
            }
        }
        console.log('Query variable %s not found', variable);
    }
});