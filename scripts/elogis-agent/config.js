/**
 * elogis 파일 슬롯 설정
 *
 * 각 파일마다:
 *   slotKey      : admin 파일업로드 슬롯 키 (SLOT_CONFIGS 의 key)
 *   label        : 로그에 표시될 이름
 *   type         : 'generic' (R2 저장) | 'store-master' (DB 반영)
 *   pageUrl      : elogis 에서 해당 데이터를 조회하는 페이지 URL
 *   prepareParams: commonExcelDownPrepare POST 파라미터
 *                  (Network 탭 > Payload 에서 복사)
 *
 * ※ USER_SESSION_ID 는 로그인 후 자동으로 추출되므로 여기에 쓰지 않습니다.
 * ※ pageUrl 을 TODO 로 남겨둔 파일은 해당 URL 을 찾아 채워주세요.
 */

const FILE_CONFIGS = [
  // ── 1. 점포마스터 (etms TMS 시스템, 클릭 자동화) ─────────────────────────
  {
    slotKey: "store-master",
    label: "점포마스터",
    type: "store-master",
    tmsDownload: true,          // TMS 새창에서 클릭으로 다운로드
    pageUrl: "https://elogis.emart24.co.kr/", // TMS 진입점 (elogis 메인)
    tmsConfig: {
      배송그룹: "D9012343",     // 배송그룹 입력값
    },
    prepareParams: null,        // TMS 는 API 방식 아님
  },

  // ── 2. 상품마스터 ─────────────────────────────────────────────────────────
  {
    slotKey: "product-master",
    label: "상품마스터",
    type: "generic",
    pageUrl: "TODO",
    prepareParams: {
      PAGING: "N",
      CURRENT_MENUCODE: "TODO",
      CURRENT_MENUNAME: "TODO",
      DOWN_EXCEL_FILTERED_ROWS: "N",
      SEARCH_URL: "TODO",
      EXCEL_SHEET_TITLE: "TODO",
      EXCEL_HEADERCOLS: "TODO",
      EXCEL_HEADERCOLS_TEXT: "TODO",
      EXCEL_HEADER_DEPTH: "1",
      EXCEL_REQUIRED_HEADERS: "",
      EXCEL_COLNAMES: "TODO",
      EXCEL_COL_WIDTH: "TODO",
      EXCEL_EDIT_FALSE_COLS: "",
      EXCEL_FIXED_COLS: "",
      EXCEL_DATE_COLS: "",
      EXCEL_DATE_COLS_FORMAT: "",
      EXCEL_NUMBER_COLS: "",
      EXCEL_COL_ALIGN: "TODO",
      EXCEL_COL_HIDDEN: "",
      EXCEL_COL_COMBOCOLS: "",
      EXCEL_COL_CHECKCOLS: "",
      EXCEL_HEADERMERGE: "",
      SES_LANG: "KO",
      SES_USERGROUP: "2000000300",
      SES_WHSE: "T01234",
      SES_MULTI_LANG_YN: "N",
    },
  },

  // ── 3. 작업센터별 취급상품 마스터 ─────────────────────────────────────────
  {
    slotKey: "workcenter-product-master",
    label: "작업센터별 취급상품 마스터",
    type: "generic",
    pageUrl: "TODO",
    prepareParams: {
      PAGING: "N",
      CURRENT_MENUCODE: "TODO",
      CURRENT_MENUNAME: "TODO",
      DOWN_EXCEL_FILTERED_ROWS: "N",
      SEARCH_URL: "TODO",
      EXCEL_SHEET_TITLE: "TODO",
      EXCEL_HEADERCOLS: "TODO",
      EXCEL_HEADERCOLS_TEXT: "TODO",
      EXCEL_HEADER_DEPTH: "1",
      EXCEL_REQUIRED_HEADERS: "",
      EXCEL_COLNAMES: "TODO",
      EXCEL_COL_WIDTH: "TODO",
      EXCEL_EDIT_FALSE_COLS: "",
      EXCEL_FIXED_COLS: "",
      EXCEL_DATE_COLS: "",
      EXCEL_DATE_COLS_FORMAT: "",
      EXCEL_NUMBER_COLS: "",
      EXCEL_COL_ALIGN: "TODO",
      EXCEL_COL_HIDDEN: "",
      EXCEL_COL_COMBOCOLS: "",
      EXCEL_COL_CHECKCOLS: "",
      EXCEL_HEADERMERGE: "",
      SES_LANG: "KO",
      SES_USERGROUP: "2000000300",
      SES_WHSE: "T01234",
      SES_MULTI_LANG_YN: "N",
    },
  },

  // ── 4. 셀관리 ─────────────────────────────────────────────────────────────
  {
    slotKey: "cell-management",
    label: "셀관리",
    type: "generic",
    pageUrl: "TODO",
    prepareParams: {
      PAGING: "N",
      CURRENT_MENUCODE: "TODO",
      CURRENT_MENUNAME: "TODO",
      DOWN_EXCEL_FILTERED_ROWS: "N",
      SEARCH_URL: "TODO",
      EXCEL_SHEET_TITLE: "TODO",
      EXCEL_HEADERCOLS: "TODO",
      EXCEL_HEADERCOLS_TEXT: "TODO",
      EXCEL_HEADER_DEPTH: "1",
      EXCEL_REQUIRED_HEADERS: "",
      EXCEL_COLNAMES: "TODO",
      EXCEL_COL_WIDTH: "TODO",
      EXCEL_EDIT_FALSE_COLS: "",
      EXCEL_FIXED_COLS: "",
      EXCEL_DATE_COLS: "",
      EXCEL_DATE_COLS_FORMAT: "",
      EXCEL_NUMBER_COLS: "",
      EXCEL_COL_ALIGN: "TODO",
      EXCEL_COL_HIDDEN: "",
      EXCEL_COL_COMBOCOLS: "",
      EXCEL_COL_CHECKCOLS: "",
      EXCEL_HEADERMERGE: "",
      SES_LANG: "KO",
      SES_USERGROUP: "2000000300",
      SES_WHSE: "T01234",
      SES_MULTI_LANG_YN: "N",
    },
  },

  // ── 5. 상품별 전략관리 ────────────────────────────────────────────────────
  {
    slotKey: "product-strategy",
    label: "상품별 전략관리",
    type: "generic",
    pageUrl: "TODO",
    prepareParams: {
      PAGING: "N",
      CURRENT_MENUCODE: "TODO",
      CURRENT_MENUNAME: "TODO",
      DOWN_EXCEL_FILTERED_ROWS: "N",
      SEARCH_URL: "TODO",
      EXCEL_SHEET_TITLE: "TODO",
      EXCEL_HEADERCOLS: "TODO",
      EXCEL_HEADERCOLS_TEXT: "TODO",
      EXCEL_HEADER_DEPTH: "1",
      EXCEL_REQUIRED_HEADERS: "",
      EXCEL_COLNAMES: "TODO",
      EXCEL_COL_WIDTH: "TODO",
      EXCEL_EDIT_FALSE_COLS: "",
      EXCEL_FIXED_COLS: "",
      EXCEL_DATE_COLS: "",
      EXCEL_DATE_COLS_FORMAT: "",
      EXCEL_NUMBER_COLS: "",
      EXCEL_COL_ALIGN: "TODO",
      EXCEL_COL_HIDDEN: "",
      EXCEL_COL_COMBOCOLS: "",
      EXCEL_COL_CHECKCOLS: "",
      EXCEL_HEADERMERGE: "",
      SES_LANG: "KO",
      SES_USERGROUP: "2000000300",
      SES_WHSE: "T01234",
      SES_MULTI_LANG_YN: "N",
    },
  },

  // ── 6. 재고현황 ───────────────────────────────────────────────────────────
  {
    slotKey: "inventory-status",
    label: "재고현황",
    type: "generic",
    pageUrl:
      "https://elogis.emart24.co.kr/view/module/wms/inventory/search/invnTotList.jsp?MENUCODE=WMS141123&MENUPATH=%253A%253A%253A%253AMENU_INVENTORY%253A%253AMENU_CMBN_INVN_SRCH%253A%253AMENU_CMBN_INVN_STATUS&APP=wms",
    prepareParams: {
      PAGING: "N",
      CURRENT_MENUCODE: "WMS141123",
      CURRENT_MENUNAME: "MENU_CMBN_INVN_SRCH::MENU_CMBN_INVN_STATUS",
      DOWN_EXCEL_FILTERED_ROWS: "N",
      SEARCH_URL: "/invnTotListService/searchAllStock",
      EXCEL_SHEET_TITLE: "MENU_CMBN_INVN_SRCH::MENU_CMBN_INVN_STATUS",
      EXCEL_HEADERCOLS:
        "WH_CD,WH_NM,ZONE_CD,ZONE_NM,WLOC_CD,LCELL_NO,STRR_ID,STRR_NM,ITEM_CD,ITEM_NM,ITEM_GCD,ITEM_GNM,ITEM_STRG_CD,INVN_SCD_NM,LOT_NO,LOT_HLD_SCD,INVN_QTY,LALOC_QTY,PRCS_QTY,ALL_HLD_QTY,INB_DATE,CONV_PRDT_DATE,VALID_DATETIME,WCELL_SCD,DCTC_TCD,RDC_CDC_PROD_TP,INVN_OLD_DAY,INV_TURNOVER_DT,AVG_DAY_SHIPMENT_CNT,SUPPR_ID,SUPPR_NM",
      EXCEL_HEADERCOLS_TEXT:
        "창고코드,창고명,존코드,존명,로케이션코드,셀,화주사코드,화주사명,상품코드,상품명,상품그룹코드,상품그룹명,상품저장코드,재고상태,로트번호,로트 보류상태,재고수량,가용수량,예약수량,보류수량,입고일자,제조일자(환산),소비기한,셀 보류상태,DC/TC,RDC/CDC,재고보유일수,재고회전일,일평균 출하수량,공급거래처,공급거래처명",
      EXCEL_HEADER_DEPTH: "1",
      EXCEL_REQUIRED_HEADERS: "",
      EXCEL_COLNAMES:
        "WH_CD,WH_NM,ZONE_CD,ZONE_NM,WLOC_CD,LCELL_NO,STRR_ID,STRR_NM,ITEM_CD,ITEM_NM,ITEM_GCD,ITEM_GNM,ITEM_STRG_CD,INVN_SCD_NM,LOT_NO,LOT_HLD_SCD,INVN_QTY,LALOC_QTY,PRCS_QTY,ALL_HLD_QTY,INB_DATE,CONV_PRDT_DATE,VALID_DATETIME,WCELL_SCD,DCTC_TCD,RDC_CDC,INVN_OLD_DAY,INVN_TURNOVER_DD,AVG_OUT_QTY_DD,SUPPR_ID,SUPPR_NM",
      EXCEL_COL_WIDTH:
        "autofit,autofit,autofit,autofit,autofit,autofit,autofit,150,autofit,250,110,140,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,120,120,120,autofit,80,90,90,90,120,autofit,140",
      EXCEL_EDIT_FALSE_COLS: "",
      EXCEL_FIXED_COLS: "",
      EXCEL_DATE_COLS: "INB_DATE,CONV_PRDT_DATE,VALID_DATETIME",
      EXCEL_DATE_COLS_FORMAT: "",
      EXCEL_NUMBER_COLS:
        "INVN_QTY,LALOC_QTY,PRCS_QTY,ALL_HLD_QTY,INVN_OLD_DAY,INVN_TURNOVER_DD,AVG_OUT_QTY_DD,SKU_DECIMAL",
      EXCEL_COL_ALIGN:
        "center,left,left,left,left,left,left,left,left,left,center,left,left,center,center,left,right,right,right,right,center,center,center,center,center,center,right,right,right,center,left",
      EXCEL_COL_HIDDEN: "",
      EXCEL_COL_COMBOCOLS: "ITEM_STRG_CD,DCTC_TCD",
      EXCEL_COL_CHECKCOLS: "",
      EXCEL_HEADERMERGE: "",
      SES_LANG: "KO",
      SES_USERGROUP: "2000000300",
      SES_WHSE: "T01234",
      SES_MULTI_LANG_YN: "N",
    },
  },

  // ── 7. 상품별재고현황 ─────────────────────────────────────────────────────
  {
    slotKey: "product-inventory",
    label: "상품별재고현황",
    type: "generic",
    pageUrl: "TODO",
    prepareParams: {
      PAGING: "N",
      CURRENT_MENUCODE: "TODO",
      CURRENT_MENUNAME: "TODO",
      DOWN_EXCEL_FILTERED_ROWS: "N",
      SEARCH_URL: "TODO",
      EXCEL_SHEET_TITLE: "TODO",
      EXCEL_HEADERCOLS: "TODO",
      EXCEL_HEADERCOLS_TEXT: "TODO",
      EXCEL_HEADER_DEPTH: "1",
      EXCEL_REQUIRED_HEADERS: "",
      EXCEL_COLNAMES: "TODO",
      EXCEL_COL_WIDTH: "TODO",
      EXCEL_EDIT_FALSE_COLS: "",
      EXCEL_FIXED_COLS: "",
      EXCEL_DATE_COLS: "",
      EXCEL_DATE_COLS_FORMAT: "",
      EXCEL_NUMBER_COLS: "",
      EXCEL_COL_ALIGN: "TODO",
      EXCEL_COL_HIDDEN: "",
      EXCEL_COL_COMBOCOLS: "",
      EXCEL_COL_CHECKCOLS: "",
      EXCEL_HEADERMERGE: "",
      SES_LANG: "KO",
      SES_USERGROUP: "2000000300",
      SES_WHSE: "T01234",
      SES_MULTI_LANG_YN: "N",
    },
  },
];

module.exports = { FILE_CONFIGS };
