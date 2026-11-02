-- Run this ENTIRE file as the Neon application table owner.
-- One atomic DO statement; no separate migration or application build is needed.
-- Source: Money Receipt Data Entry-fundraisers correction.xlsm / COLLECTION, rows 2-322.
-- Names only: the two changed date cells are deliberately not applied.
-- Retain one existing JAH code; never renumber assignments, slips or certificates.
-- No collection entries are imported, deleted, checked or finalized by this file.
-- Also retain the user's earlier confirmed alias: Maulana Dilbar = Dilbar Raza.
DO $correct_fundraiser_identities$
DECLARE
  batch_hash constant text := '45e535956bf0dde4b62ebd1ba0bd961346e224cc13f11285acff6b28b57b6f9b';
  item record;
  problem text;
  assignment_updates integer;
  alias_count integer;
  named_rows integer;
  result jsonb;
BEGIN
  IF current_user = 'dms_runtime' OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_class WHERE oid IN (
      'public.people'::regclass,'public.fundraisers'::regclass,'public.book_assignments'::regclass,
      'public.book_returns'::regclass,'public.book_receipts'::regclass,'public.legacy_collection_imports'::regclass
    ) AND relowner <> current_user::regrole::oid
  ) THEN
    RAISE EXCEPTION 'Run this file as the owner of the application tables' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('dms:import:Book3_v1'));
  PERFORM pg_advisory_xact_lock(hashtext('dms:book-stock:write'));
  LOCK TABLE public.people,public.fundraisers,public.book_assignments,public.book_cases,
    public.book_returns,public.book_receipts,public.book_flags,public.book_losses,
    public.leftover_books,public.collector_edit_requests,public.legacy_collection_imports
    IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.activity_log WHERE action='FUNDRAISER_IDENTITIES_CORRECTED'
    AND resource='fundraisers' AND record_id=batch_hash) THEN
    RAISE NOTICE 'This corrected workbook has already been applied; no changes made';
    RETURN;
  END IF;

  CREATE TEMP TABLE dms_identity_source_profiles (
    source_id integer PRIMARY KEY,original_name text NOT NULL,corrected_name text NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO dms_identity_source_profiles VALUES
    (1,'Abdul Hafiz','Abdul Hafiz'),
    (2,'Abdul Rahim','Abdul Rahim'),
    (3,'Abu Salik','Abu Salik'),
    (4,'Abu Sufyan','Abu Sufyan'),
    (5,'Ahmad Raza','Ahmad Raza'),
    (6,'Akmal Husain','Shaikh Akmal Husain'),
    (7,'Alauddin','Alauddin'),
    (8,'Alhaj Ghulam Rabbani','Shaikh Gholam Rabbani'),
    (9,'Amanatullah','Amanatullah'),
    (10,'Arif Hussain','Arif Hussain'),
    (11,'Arshad','Arshad'),
    (12,'Arshad Mullah','Arshad Mullah'),
    (13,'Ashiq Misbahi','Aasik Khan'),
    (14,'Ashique Khan Misbahi','Aasik Khan'),
    (15,'Ashique Misbahi','Aasik Khan'),
    (16,'Asique Misbahi','Aasik Khan'),
    (17,'Asrar Ahmad','Asrar Ahmad'),
    (18,'Badal Kumar','Badal Kumar'),
    (19,'Bani Kund Imam','Bani Kund Imam'),
    (20,'Bashirul Hasan','Bashirul Hasan'),
    (21,'Danish Raza','Danish Raza'),
    (22,'Dilbar','Dilbar Raza'),
    (23,'Dilbar Raza','Dilbar Raza'),
    (24,'Ershad Naimi','Ershad Naimi'),
    (25,'Faisal','Faisal'),
    (26,'Faizan','Faizan'),
    (27,'Faizan Raza','Faizan Raza'),
    (28,'Firoz','Firoz'),
    (29,'Ghulam Khaja','Ghulam Khaja'),
    (30,'Gulzar Ahmad','Gulzar Ahmad'),
    (31,'Hafiz Abul Imdad','Imdad Alam'),
    (32,'Hafiz Azhar','Hafiz Azhar'),
    (33,'Hafiz Imdad','Imdad Alam'),
    (34,'Hafiz Imdad Alam','Imdad Alam'),
    (35,'Hafiz Moez Uddin','Hafiz Moez Uddin'),
    (36,'Hafiz Qasim','Hafiz Qasim'),
    (37,'Hafiz Salim','Hafiz Salim'),
    (38,'Haji Gholam Rabbani','Shaikh Gholam Rabbani'),
    (39,'Haji Ghoma Rabbani','Shaikh Gholam Rabbani'),
    (40,'Haji Shaikh Gholam Rabbani','Shaikh Gholam Rabbani'),
    (41,'Hasnain','Hasnain'),
    (42,'Hasnain Raza','Hasnain Raza'),
    (43,'Iftekhar','Iftekhar'),
    (44,'Imdad Alam','Imdad Alam'),
    (45,'Imran','Imran'),
    (46,'Imran Raza','Imran Raza'),
    (47,'Imtiyaz','Imtiyaz'),
    (48,'Irfan','Irfan'),
    (49,'Irfan Raza','Irfan Raza'),
    (50,'Khwaja','Khwaja'),
    (51,'M Ashiq Khan','Aasik Khan'),
    (52,'M Ashiq Khan Misbahi','Aasik Khan'),
    (53,'M Ashiqu Misbahi','Aasik Khan'),
    (54,'M Saiyed Manzar Husain','M Saiyed Manzar Husain'),
    (55,'Mahboob Alam','Mahboob Alam'),
    (56,'Maulana Abdullah','Maulana Abdullah'),
    (57,'Maulana Abu Tahir','Maulana Abu Tahir'),
    (58,'Maulana Ahmad Raza','Maulana Ahmad Raza'),
    (59,'Maulana Ashiq Khan','Aasik Khan'),
    (60,'Maulana Ashiqu Misbahi','Aasik Khan'),
    (61,'Maulana Ashique','Aasik Khan'),
    (62,'Maulana Ashique Khan','Aasik Khan'),
    (63,'Maulana Ashique Misbahi','Aasik Khan'),
    (64,'Maulana Azizul Karim','Maulana Azizul Karim'),
    (65,'Maulana Dilbar','Maulana Dilbar'),
    (66,'Maulana Gholam Ahmad Raza','Maulana Gholam Ahmad Raza'),
    (67,'Maulana Ilyas','Maulana Ilyas'),
    (68,'Maulana Ilyas Misbahi','Maulana Ilyas Misbahi'),
    (69,'Maulana Qasim Ali','Maulana Qasim Ali'),
    (70,'Maulana Raunaq','Maulana Raunaq'),
    (71,'Maulana Raunaque','Maulana Raunaque'),
    (72,'Maulana Rawnaque','Maulana Raunaque'),
    (73,'Maulana Saiyed Mujahid','Maulana Saiyed Mujahid'),
    (74,'Meraj','Meraj'),
    (75,'Meraj Ahmad','Meraj Ahmad'),
    (76,'Modassir','Modassir'),
    (77,'Modassir Husain','Modassir Husain'),
    (78,'Mohammad Arshad Mulla','Mohammad Arshad Mulla'),
    (79,'Mohammad Imteyaz','Mohammad Imteyaz'),
    (80,'Mohammad Raza','Mohammad Raza'),
    (81,'Mohammad Yasin','Mohammad Yasin'),
    (82,'Moiz Aalam','Moiz Aalam'),
    (83,'Moiz Alam','Moiz Aalam'),
    (84,'Mufti Tanveer Markazi','Mufti Tanveer Markazi'),
    (85,'Mujahid','Mujahid'),
    (86,'Mujahid Husain','Mujahid Husain'),
    (87,'Mujahid Raza','Mujahid Raza'),
    (88,'Mujeem','Mujeem'),
    (89,'Muslim Raza','Muslim Raza'),
    (90,'Naimuddin','Naimuddin'),
    (91,'Nizami','Nizami'),
    (92,'Nurul Qamar','Nurul Qamar'),
    (93,'Qamrul Islam','Qamrul Islam'),
    (94,'Qasim','Qasim'),
    (95,'Quari Bilal Ahmad','Quari Bilal Ahmad'),
    (96,'Quari Faizan Raza','Quari Faizan Raza'),
    (97,'Quari Gholam Ghaus','Quari Gholam Ghaus'),
    (98,'Quari Ghulam Ghaus','Quari Gholam Ghaus'),
    (99,'Ramzani','Ramzani'),
    (100,'Rehan','Rehan'),
    (101,'Rehan Raza','Rehan Raza'),
    (102,'Riyazat Husain','Shaikh Riyazat Husain'),
    (103,'S G Rabbani','Shaikh Gholam Rabbani'),
    (104,'S R Hussain','Shaikh Riyazat Husain'),
    (105,'Sahil','Sahil'),
    (106,'Saiyed Abdul Aziz','Saiyed Abdul Aziz'),
    (107,'Salim','Salim'),
    (108,'Salman','Salman'),
    (109,'Salman Raza','Salman Raza'),
    (110,'Sarfaraz','Sarfaraz'),
    (111,'Sayed Abdul Aziz','Sayed Abdul Aziz'),
    (112,'Shahid','Shahid'),
    (113,'Shaikh Akmal Husain','Shaikh Akmal Husain'),
    (114,'Shaikh Gholam Rabbani','Shaikh Gholam Rabbani'),
    (115,'Shaikh Riyajat Hussain','Shaikh Riyazat Husain'),
    (116,'Shaikh Riyazat Hussain','Shaikh Riyazat Husain'),
    (117,'Shamsher Bhai','Shamsher Bhai'),
    (118,'Sharafat','Sharafat'),
    (119,'Shoaib Alam','Shoaib Alam'),
    (120,'Shoib Alam','Shoib Alam'),
    (121,'Sona Bhai','Sona Bhai'),
    (122,'Soroor Ali','Soroor Ali'),
    (123,'Subhani','Subhani'),
    (124,'Sufyan','Sufyan'),
    (125,'Sufyan Raza','Sufyan Raza'),
    (126,'Syed Mujahid','Syed Mujahid'),
    (127,'Tabrez/Wasim','Tabrez/Wasim'),
    (128,'Tahir Raza','Tahir Raza'),
    (129,'Tajuddin Khan','Tajuddin Khan'),
    (130,'Tanweer','Tanweer'),
    (131,'Tauseef Raza','Tauseef Raza'),
    (132,'Tauseef Raza/Salahuddin','Tauseef Raza/Salahuddin'),
    (133,'Wajid Khan','Wajid Khan'),
    (134,'Yasin','Yasin'),
    (135,'Zahir','Zahir'),
    (136,'Zahiruddin','Zahiruddin'),
    (137,'Ziauddin','Ziauddin'),
    (138,'Ziauddin Shaikh','Ziauddin Shaikh')
  ;
  CREATE TEMP TABLE dms_identity_source_rows (
    source_row integer PRIMARY KEY,source_id integer,original_name text NOT NULL,
    corrected_name text NOT NULL,original_book jsonb,original_type text,original_edition text
  ) ON COMMIT DROP;
  INSERT INTO dms_identity_source_rows VALUES
    (2,'93','Qamrul Islam','Qamrul Islam','666'::jsonb,'Common','5th'),
    (3,'93','Qamrul Islam','Qamrul Islam','669'::jsonb,'Common','5th'),
    (4,'93','Qamrul Islam','Qamrul Islam','668'::jsonb,'Common','5th'),
    (5,'62','Maulana Ashique Khan','Aasik Khan','657'::jsonb,'Common','5th'),
    (6,'35','Hafiz Moez Uddin','Hafiz Moez Uddin','627'::jsonb,'Common','5th'),
    (7,'35','Hafiz Moez Uddin','Hafiz Moez Uddin','628'::jsonb,'Common','5th'),
    (8,'80','Mohammad Raza','Mohammad Raza','317'::jsonb,'Common','4th'),
    (9,'80','Mohammad Raza','Mohammad Raza','318'::jsonb,'Common','4th'),
    (10,'135','Zahir','Zahir','649'::jsonb,'Common','5th'),
    (11,'135','Zahir','Zahir','650'::jsonb,'Common','5th'),
    (12,NULL,'','','6'::jsonb,'Common','6th'),
    (13,'71','Maulana Raunaque','Maulana Raunaque','38'::jsonb,'Common','6th'),
    (14,'72','Maulana Rawnaque','Maulana Raunaque','37'::jsonb,'Common','6th'),
    (15,'64','Maulana Azizul Karim','Maulana Azizul Karim','461'::jsonb,'Common','4th'),
    (16,'113','Shaikh Akmal Husain','Shaikh Akmal Husain','443'::jsonb,'Common','5th'),
    (17,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','11'::jsonb,'Common','6th'),
    (18,'37','Hafiz Salim','Hafiz Salim','108'::jsonb,'Common','2nd'),
    (19,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','42'::jsonb,'Common','6th'),
    (20,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','24'::jsonb,'Common','6th'),
    (21,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','25'::jsonb,'Common','6th'),
    (22,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','26'::jsonb,'Common','6th'),
    (23,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','44'::jsonb,'Common','6th'),
    (24,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','20'::jsonb,'Common','6th'),
    (25,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','19'::jsonb,'Common','6th'),
    (26,'69','Maulana Qasim Ali','Maulana Qasim Ali','22'::jsonb,'Common','6th'),
    (27,'62','Maulana Ashique Khan','Aasik Khan','16'::jsonb,'Common','6th'),
    (28,'62','Maulana Ashique Khan','Aasik Khan','17'::jsonb,'Common','6th'),
    (29,'62','Maulana Ashique Khan','Aasik Khan','441'::jsonb,'Common','4th'),
    (30,'66','Maulana Gholam Ahmad Raza','Maulana Gholam Ahmad Raza','12'::jsonb,'Common','6th'),
    (31,'58','Maulana Ahmad Raza','Maulana Ahmad Raza','688'::jsonb,'Common','5th'),
    (32,'131','Tauseef Raza','Tauseef Raza','9'::jsonb,'Common','6th'),
    (33,'132','Tauseef Raza/Salahuddin','Tauseef Raza/Salahuddin','499'::jsonb,'Common','5th'),
    (34,'131','Tauseef Raza','Tauseef Raza','41'::jsonb,'Common','6th'),
    (35,'131','Tauseef Raza','Tauseef Raza','10'::jsonb,'Common','6th'),
    (36,'98','Quari Ghulam Ghaus','Quari Gholam Ghaus','29'::jsonb,'Common','6th'),
    (37,'62','Maulana Ashique Khan','Aasik Khan','30'::jsonb,'Common','6th'),
    (38,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','6'::jsonb,'Common','6th'),
    (39,'138','Ziauddin Shaikh','Ziauddin Shaikh','200'::jsonb,'T100','1st'),
    (40,'95','Quari Bilal Ahmad','Quari Bilal Ahmad','2'::jsonb,'Khoraki','1st'),
    (41,'82','Moiz Aalam','Moiz Aalam','497'::jsonb,'Common',NULL),
    (42,'57','Maulana Abu Tahir','Maulana Abu Tahir','32'::jsonb,'Common','6th'),
    (43,'57','Maulana Abu Tahir','Maulana Abu Tahir','35'::jsonb,'Common','6th'),
    (44,'57','Maulana Abu Tahir','Maulana Abu Tahir','36'::jsonb,'Common','6th'),
    (45,'74','Meraj','Meraj','494'::jsonb,'Common','4th'),
    (46,'120','Shoib Alam','Shoib Alam','707'::jsonb,'Common','5th'),
    (47,'119','Shoaib Alam','Shoaib Alam','466'::jsonb,'Common','4th'),
    (48,'3','Abu Salik','Abu Salik','490'::jsonb,'Common','4th'),
    (49,'63','Maulana Ashique Misbahi','Aasik Khan','421'::jsonb,'Common','4th'),
    (50,'129','Tajuddin Khan','Tajuddin Khan','703'::jsonb,'Common','5th'),
    (51,'83','Moiz Alam','Moiz Aalam','498'::jsonb,'Common','5th'),
    (52,'95','Quari Bilal Ahmad','Quari Bilal Ahmad','4'::jsonb,'Common','6th'),
    (53,'95','Quari Bilal Ahmad','Quari Bilal Ahmad','5'::jsonb,'Common','6th'),
    (54,'95','Quari Bilal Ahmad','Quari Bilal Ahmad','424'::jsonb,'Common','4th'),
    (55,'95','Quari Bilal Ahmad','Quari Bilal Ahmad','492'::jsonb,'Common','4th'),
    (56,'95','Quari Bilal Ahmad','Quari Bilal Ahmad','1'::jsonb,'Common','6th'),
    (57,'95','Quari Bilal Ahmad','Quari Bilal Ahmad','673'::jsonb,'Common','6th'),
    (58,'95','Quari Bilal Ahmad','Quari Bilal Ahmad','464'::jsonb,'Common','6th'),
    (59,'95','Quari Bilal Ahmad','Quari Bilal Ahmad','3'::jsonb,'Common','6th'),
    (60,'95','Quari Bilal Ahmad','Quari Bilal Ahmad','2'::jsonb,'Common','6th'),
    (61,'95','Quari Bilal Ahmad','Quari Bilal Ahmad','8'::jsonb,'Common','6th'),
    (62,'95','Quari Bilal Ahmad','Quari Bilal Ahmad','425'::jsonb,'Common','4th'),
    (63,'95','Quari Bilal Ahmad','Quari Bilal Ahmad','426'::jsonb,'Common','4th'),
    (64,'115','Shaikh Riyajat Hussain','Shaikh Riyazat Husain','13'::jsonb,'Common','6th'),
    (65,'121','Sona Bhai','Sona Bhai','43'::jsonb,'Common','6th'),
    (66,'45','Imran','Imran','488'::jsonb,'Common','5th'),
    (67,'45','Imran','Imran','489'::jsonb,'Common','5th'),
    (68,'133','Wajid Khan','Wajid Khan','481'::jsonb,'Common','5th'),
    (69,'133','Wajid Khan','Wajid Khan','482'::jsonb,'Common','5th'),
    (70,'29','Ghulam Khaja','Ghulam Khaja','480'::jsonb,'Common','5th'),
    (71,'62','Maulana Ashique Khan','Aasik Khan','667'::jsonb,'Common','5th'),
    (72,'61','Maulana Ashique','Aasik Khan','27'::jsonb,'Common','6th'),
    (73,'28','Firoz','Firoz','484'::jsonb,'Common','5th'),
    (74,'28','Firoz','Firoz','485'::jsonb,'Common','5th'),
    (75,'28','Firoz','Firoz','487'::jsonb,'Common','5th'),
    (76,'103','S G Rabbani','Shaikh Gholam Rabbani','47'::jsonb,'Common','6th'),
    (77,'15','Ashique Misbahi','Aasik Khan','48'::jsonb,'Common','6th'),
    (78,'127','Tabrez/Wasim','Tabrez/Wasim','637'::jsonb,'Common','5th'),
    (79,'94','Qasim','Qasim','23'::jsonb,'Common','6th'),
    (80,'21','Danish Raza','Danish Raza','696'::jsonb,'Common','5th'),
    (81,'43','Iftekhar','Iftekhar','493'::jsonb,'Common','5th'),
    (82,'9','Amanatullah','Amanatullah','483'::jsonb,'Common','4th'),
    (83,'14','Ashique Khan Misbahi','Aasik Khan','49'::jsonb,'Common','6th'),
    (84,'93','Qamrul Islam','Qamrul Islam','14'::jsonb,'Common','5th'),
    (85,'93','Qamrul Islam','Qamrul Islam','15'::jsonb,'Common','6th'),
    (86,'136','Zahiruddin','Zahiruddin','470'::jsonb,'Common','4th'),
    (87,'116','Shaikh Riyazat Hussain','Shaikh Riyazat Husain','261'::jsonb,'Common','6th'),
    (88,'40','Haji Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','21'::jsonb,'Common','6th'),
    (89,'15','Ashique Misbahi','Aasik Khan','55'::jsonb,'Common','6th'),
    (90,'90','Naimuddin','Naimuddin','479'::jsonb,'Common','4th'),
    (91,'15','Ashique Misbahi','Aasik Khan','31'::jsonb,'Common','6th'),
    (92,'104','S R Hussain','Shaikh Riyazat Husain','440'::jsonb,'Common','4th'),
    (93,'103','S G Rabbani','Shaikh Gholam Rabbani','56'::jsonb,'Common','6th'),
    (94,'51','M Ashiq Khan','Aasik Khan','252'::jsonb,'Common','6th'),
    (95,'8','Alhaj Ghulam Rabbani','Shaikh Gholam Rabbani','61'::jsonb,'Common','6th'),
    (96,'108','Salman','Salman','478'::jsonb,'Common','4th'),
    (97,'15','Ashique Misbahi','Aasik Khan','54'::jsonb,'Common','6th'),
    (98,'16','Asique Misbahi','Aasik Khan','58'::jsonb,'Common','6th'),
    (99,'102','Riyazat Husain','Shaikh Riyazat Husain','440'::jsonb,'Common','4th'),
    (100,'38','Haji Gholam Rabbani','Shaikh Gholam Rabbani','124'::jsonb,'Common','6th'),
    (101,'38','Haji Gholam Rabbani','Shaikh Gholam Rabbani','122'::jsonb,'Common','6th'),
    (102,'38','Haji Gholam Rabbani','Shaikh Gholam Rabbani','125'::jsonb,'Common','6th'),
    (103,'38','Haji Gholam Rabbani','Shaikh Gholam Rabbani','126'::jsonb,'Common','6th'),
    (104,'38','Haji Gholam Rabbani','Shaikh Gholam Rabbani','661'::jsonb,'Common','6th'),
    (105,'38','Haji Gholam Rabbani','Shaikh Gholam Rabbani','143'::jsonb,'Common','6th'),
    (106,'38','Haji Gholam Rabbani','Shaikh Gholam Rabbani','127'::jsonb,'Common','6th'),
    (107,'38','Haji Gholam Rabbani','Shaikh Gholam Rabbani','133'::jsonb,'Common','6th'),
    (108,'38','Haji Gholam Rabbani','Shaikh Gholam Rabbani','146'::jsonb,'Common','6th'),
    (109,'55','Mahboob Alam','Mahboob Alam','147'::jsonb,'Common','6th'),
    (110,'97','Quari Gholam Ghaus','Quari Gholam Ghaus','91'::jsonb,'Common','6th'),
    (111,'97','Quari Gholam Ghaus','Aasik Khan','92'::jsonb,'Common','6th'),
    (112,'126','Syed Mujahid','Syed Mujahid','95'::jsonb,'Common','6th'),
    (113,'47','Imtiyaz','Imtiyaz','373'::jsonb,'Common','2nd'),
    (114,'70','Maulana Raunaq','Maulana Raunaq','149'::jsonb,'Common','6th'),
    (115,'70','Maulana Raunaq','Maulana Raunaq','141'::jsonb,'Common','6th'),
    (116,'70','Maulana Raunaq','Maulana Raunaq','142'::jsonb,'Common','6th'),
    (117,'70','Maulana Raunaq','Maulana Raunaq','150'::jsonb,'Common','6th'),
    (118,'70','Maulana Raunaq','Maulana Raunaq','72'::jsonb,'Common','6th'),
    (119,'59','Maulana Ashiq Khan','Aasik Khan','137'::jsonb,'Common','6th'),
    (120,'96','Quari Faizan Raza','Quari Faizan Raza','132'::jsonb,'Common','6th'),
    (121,'34','Hafiz Imdad Alam','Imdad Alam','211'::jsonb,'T100','1st'),
    (122,'5','Ahmad Raza','Ahmad Raza','18'::jsonb,'Common','6th'),
    (123,'36','Hafiz Qasim','Hafiz Qasim','64'::jsonb,'Common','6th'),
    (124,'34','Hafiz Imdad Alam','Imdad Alam','104'::jsonb,'T50','1st'),
    (125,'121','Sona Bhai','Sona Bhai','62'::jsonb,'Common','6th'),
    (126,'13','Ashiq Misbahi','Aasik Khan','93'::jsonb,'Common','6th'),
    (127,'13','Ashiq Misbahi','Aasik Khan','135'::jsonb,'Common','6th'),
    (128,'59','Maulana Ashiq Khan','Aasik Khan','138'::jsonb,'Common','6th'),
    (129,'4','Abu Sufyan','Abu Sufyan','219'::jsonb,'T100','1st'),
    (130,'4','Abu Sufyan','Abu Sufyan','119'::jsonb,'T50','1st'),
    (131,'4','Abu Sufyan','Abu Sufyan','94'::jsonb,'Common','6th'),
    (132,'57','Maulana Abu Tahir','Maulana Abu Tahir','73'::jsonb,'Common','6th'),
    (133,'76','Modassir','Modassir','108'::jsonb,'Common','6th'),
    (134,'50','Khwaja','Khwaja','112'::jsonb,'Common','6th'),
    (135,'134','Yasin','Yasin','115'::jsonb,'T50','1st'),
    (136,'20','Bashirul Hasan','Bashirul Hasan','129'::jsonb,'Common','6th'),
    (137,'20','Bashirul Hasan','Bashirul Hasan','130'::jsonb,'Common','6th'),
    (138,'20','Bashirul Hasan','Bashirul Hasan','128'::jsonb,'Common','6th'),
    (139,'134','Yasin','Yasin','107'::jsonb,'Common','6th'),
    (140,'63','Maulana Ashique Misbahi','Aasik Khan','50'::jsonb,'Common','6th'),
    (141,'63','Maulana Ashique Misbahi','Aasik Khan','59'::jsonb,'Common','6th'),
    (142,'109','Salman Raza','Salman Raza','106'::jsonb,'Common','6th'),
    (143,'125','Sufyan Raza','Sufyan Raza','215'::jsonb,'T100','1st'),
    (144,'124','Sufyan','Sufyan','114'::jsonb,'T50','1st'),
    (145,'109','Salman Raza','Salman Raza','113'::jsonb,'T50','1st'),
    (146,'53','M Ashiqu Misbahi','Aasik Khan','134'::jsonb,'Common','6th'),
    (147,'26','Faizan','Faizan','87'::jsonb,'Common','6th'),
    (148,'60','Maulana Ashiqu Misbahi','Aasik Khan','442'::jsonb,'Common','4th'),
    (149,'64','Maulana Azizul Karim','Maulana Azizul Karim','71'::jsonb,'Common','6th'),
    (150,'75','Meraj Ahmad','Meraj Ahmad','117'::jsonb,'Common','6th'),
    (151,'17','Asrar Ahmad','Asrar Ahmad','100'::jsonb,'Common','6th'),
    (152,'75','Meraj Ahmad','Meraj Ahmad','220'::jsonb,'Common','6th'),
    (153,'30','Gulzar Ahmad','Gulzar Ahmad','120'::jsonb,'T50','1st'),
    (154,'111','Sayed Abdul Aziz','Sayed Abdul Aziz','82'::jsonb,'Common','6th'),
    (155,'101','Rehan Raza','Rehan Raza','88'::jsonb,'Common','6th'),
    (156,'5','Ahmad Raza','Ahmad Raza','"(Missed by Collector)90"'::jsonb,'Common','6th'),
    (157,'87','Mujahid Raza','Mujahid Raza','105'::jsonb,'Common','6th'),
    (158,'92','Nurul Qamar','Nurul Qamar','117'::jsonb,'Common','6th'),
    (159,'87','Mujahid Raza','Mujahid Raza','139'::jsonb,'Common','6th'),
    (160,'6','Akmal Husain','Shaikh Akmal Husain','28'::jsonb,'Common','6th'),
    (161,'101','Rehan Raza','Rehan Raza','98'::jsonb,'Common','6th'),
    (162,'101','Rehan Raza','Rehan Raza','99'::jsonb,'Common','6th'),
    (163,'56','Maulana Abdullah','Maulana Abdullah','7'::jsonb,'Common','6th'),
    (164,'56','Maulana Abdullah','Maulana Abdullah','418'::jsonb,'Common','4th'),
    (165,'27','Faizan Raza','Faizan Raza','86'::jsonb,'Common','6th'),
    (166,'30','Gulzar Ahmad','Gulzar Ahmad','89'::jsonb,'Common','6th'),
    (167,'42','Hasnain Raza','Hasnain Raza','96'::jsonb,'Common','6th'),
    (168,'68','Maulana Ilyas Misbahi','Maulana Ilyas Misbahi','120'::jsonb,'Common','6th'),
    (169,'67','Maulana Ilyas','Maulana Ilyas','119'::jsonb,'Common','6th'),
    (170,'46','Imran Raza','Imran Raza','84'::jsonb,'Common','6th'),
    (171,'67','Maulana Ilyas','Maulana Ilyas','121'::jsonb,'Common','6th'),
    (172,'128','Tahir Raza','Tahir Raza','66'::jsonb,'Common','6th'),
    (173,'110','Sarfaraz','Sarfaraz','217'::jsonb,'T100','1st'),
    (174,'12','Arshad Mullah','Arshad Mullah','116'::jsonb,'T50','1st'),
    (175,'110','Sarfaraz','Sarfaraz','117'::jsonb,'T50','1st'),
    (176,'99','Ramzani','Ramzani','118'::jsonb,'T50','1st'),
    (177,'99','Ramzani','Ramzani','218'::jsonb,'T100','1st'),
    (178,NULL,'','','97'::jsonb,'Common','6th'),
    (179,NULL,'','','78'::jsonb,'Common','6th'),
    (180,NULL,'','','110'::jsonb,'Common','6th'),
    (181,NULL,'','','77'::jsonb,'Common','6th'),
    (182,NULL,'','','76'::jsonb,'Common','6th'),
    (183,NULL,'','','75'::jsonb,'Common','6th'),
    (184,NULL,'','','74'::jsonb,'Common','6th'),
    (185,NULL,'','','83'::jsonb,'Common','6th'),
    (186,NULL,'','','83'::jsonb,'Common','6th'),
    (187,NULL,'','','140'::jsonb,'Common','6th'),
    (188,'123','Subhani','Subhani','689'::jsonb,'Common','6th'),
    (189,'23','Dilbar Raza','Dilbar Raza','430'::jsonb,'Common','5th'),
    (190,'59','Maulana Ashiq Khan','Aasik Khan','50'::jsonb,'Common','6th'),
    (191,'59','Maulana Ashiq Khan','Aasik Khan','53'::jsonb,'Common','6th'),
    (192,'102','Riyazat Husain','Shaikh Riyazat Husain','201'::jsonb,'T100','1st'),
    (193,'10','Arif Hussain','Arif Hussain','52'::jsonb,'Common','6th'),
    (194,'118','Sharafat','Sharafat','111'::jsonb,'Common','6th'),
    (195,'85','Mujahid','Mujahid','105'::jsonb,'Common','6th'),
    (196,'24','Ershad Naimi','Ershad Naimi','70'::jsonb,'Common','6th'),
    (197,'8','Alhaj Ghulam Rabbani','Shaikh Gholam Rabbani','60'::jsonb,'Common','6th'),
    (198,'14','Ashique Khan Misbahi','Aasik Khan','662'::jsonb,'Common','4th'),
    (199,'65','Maulana Dilbar','Maulana Dilbar','430'::jsonb,'Common','5th'),
    (200,'65','Maulana Dilbar','Maulana Dilbar','67'::jsonb,'Common','6th'),
    (201,'112','Shahid','Shahid','8'::jsonb,'T50','1st'),
    (202,'112','Shahid','Shahid','233'::jsonb,'T100','1st'),
    (203,'59','Maulana Ashiq Khan','Aasik Khan','148'::jsonb,'Common','6th'),
    (204,'49','Irfan Raza','Irfan Raza','118'::jsonb,'Common','6th'),
    (205,'59','Maulana Ashiq Khan','Aasik Khan','442'::jsonb,'Common','5th'),
    (206,'59','Maulana Ashiq Khan','Aasik Khan','136'::jsonb,'Common','6th'),
    (207,'46','Imran Raza','Imran Raza','113'::jsonb,'Common','6th'),
    (208,'59','Maulana Ashiq Khan','Aasik Khan','79'::jsonb,'Common','6th'),
    (209,'130','Tanweer','Tanweer','103'::jsonb,'Common','6th'),
    (210,'130','Tanweer','Tanweer','104'::jsonb,'Common','6th'),
    (211,'130','Tanweer','Tanweer','212'::jsonb,'T100','1st'),
    (212,'130','Tanweer','Tanweer','111'::jsonb,'T50','1st'),
    (213,'59','Maulana Ashiq Khan','Aasik Khan','131'::jsonb,'Common','6th'),
    (214,'137','Ziauddin','Ziauddin','107'::jsonb,'T50','1st'),
    (215,'38','Haji Gholam Rabbani','Shaikh Gholam Rabbani','152'::jsonb,'Common','6th'),
    (216,'18','Badal Kumar','Badal Kumar','163'::jsonb,'Common','2nd'),
    (217,'52','M Ashiq Khan Misbahi','Aasik Khan','154'::jsonb,'Common','6th'),
    (218,'52','M Ashiq Khan Misbahi','Aasik Khan','155'::jsonb,'Common','6th'),
    (219,'39','Haji Ghoma Rabbani','Shaikh Gholam Rabbani','156'::jsonb,'Common','6th'),
    (220,'52','M Ashiq Khan Misbahi','Aasik Khan','153'::jsonb,'Common','6th'),
    (221,'51','M Ashiq Khan','Aasik Khan','158'::jsonb,'Common','6th'),
    (222,'51','M Ashiq Khan','Aasik Khan','160'::jsonb,'Common','6th'),
    (223,'52','M Ashiq Khan Misbahi','Aasik Khan','161'::jsonb,'Common','6th'),
    (224,'51','M Ashiq Khan','Aasik Khan','157'::jsonb,'Common','6th'),
    (225,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','242'::jsonb,'Common',NULL),
    (226,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','239'::jsonb,'Common','6th'),
    (227,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','241'::jsonb,'Common','6th'),
    (228,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','164'::jsonb,'Common','6th'),
    (229,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','240'::jsonb,'Common','6th'),
    (230,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','238'::jsonb,'Common','6th'),
    (231,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','167'::jsonb,'Common','6th'),
    (232,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','243'::jsonb,'Common','6th'),
    (233,'103','S G Rabbani','Shaikh Gholam Rabbani','237'::jsonb,'Common','6th'),
    (234,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','266'::jsonb,'Common','6th'),
    (235,'70','Maulana Raunaq','Maulana Raunaq','264'::jsonb,'Common','6th'),
    (236,'70','Maulana Raunaq','Maulana Raunaq','166'::jsonb,'Common','6th'),
    (237,'70','Maulana Raunaq','Maulana Raunaq','174'::jsonb,'Common','6th'),
    (238,'70','Maulana Raunaq','Maulana Raunaq','268'::jsonb,'Common','6th'),
    (239,'59','Maulana Ashiq Khan','Aasik Khan','257'::jsonb,'Common','6th'),
    (240,'97','Quari Gholam Ghaus','Quari Gholam Ghaus','254'::jsonb,'Common','6th'),
    (241,'97','Quari Gholam Ghaus','Quari Gholam Ghaus','255'::jsonb,'Common','6th'),
    (242,'70','Maulana Raunaq','Maulana Raunaq','149'::jsonb,'Common','6th'),
    (243,'36','Hafiz Qasim','Hafiz Qasim','171'::jsonb,'Common','6th'),
    (244,'64','Maulana Azizul Karim','Maulana Azizul Karim','151'::jsonb,'Common','6th'),
    (245,'59','Maulana Ashiq Khan','Aasik Khan','256'::jsonb,'Common','6th'),
    (246,'105','Sahil','Sahil','234'::jsonb,'T100',NULL),
    (247,'31','Hafiz Abul Imdad','Imdad Alam','223'::jsonb,'T100',NULL),
    (248,'33','Hafiz Imdad','Imdad Alam','126'::jsonb,'T50',NULL),
    (249,'33','Hafiz Imdad','Imdad Alam','211'::jsonb,'T100',NULL),
    (250,'73','Maulana Saiyed Mujahid','Maulana Saiyed Mujahid','95'::jsonb,'Common','6th'),
    (251,'89','Muslim Raza','Muslim Raza','128'::jsonb,'T50',NULL),
    (252,'7','Alauddin','Alauddin','125'::jsonb,'T50',NULL),
    (253,'78','Mohammad Arshad Mulla','Mohammad Arshad Mulla','216'::jsonb,'T100',NULL),
    (254,'107','Salim','Salim','225'::jsonb,'T100',NULL),
    (255,'105','Sahil','Sahil','134'::jsonb,'T50',NULL),
    (256,'105','Sahil','Sahil','239'::jsonb,'T100',NULL),
    (257,'105','Sahil','Sahil','238'::jsonb,'T100',NULL),
    (258,'105','Sahil','Sahil','189'::jsonb,'Common','6th'),
    (259,'114','Shaikh Gholam Rabbani','Shaikh Gholam Rabbani','159'::jsonb,'Common','6th'),
    (260,'26','Faizan','Faizan','200'::jsonb,'Common','6th'),
    (261,'26','Faizan','Faizan','199'::jsonb,'Common','6th'),
    (262,'59','Maulana Ashiq Khan','Aasik Khan','260'::jsonb,'Common','6th'),
    (263,'117','Shamsher Bhai','Shamsher Bhai','262'::jsonb,'Common','6th'),
    (264,'109','Salman Raza','Salman Raza','211'::jsonb,'Common','6th'),
    (265,'44','Imdad Alam','Imdad Alam','51'::jsonb,'Common','6th'),
    (266,'101','Rehan Raza','Rehan Raza','212'::jsonb,'Common','6th'),
    (267,'92','Nurul Qamar','Nurul Qamar','208'::jsonb,'Common','6th'),
    (268,'2','Abdul Rahim','Abdul Rahim','181'::jsonb,'Common','6th'),
    (269,'30','Gulzar Ahmad','Gulzar Ahmad','201'::jsonb,'Common','6th'),
    (270,'86','Mujahid Husain','Mujahid Husain','186'::jsonb,'Common','6th'),
    (271,'48','Irfan','Irfan','197'::jsonb,'Common','6th'),
    (272,'59','Maulana Ashiq Khan','Aasik Khan','248'::jsonb,'Common','6th'),
    (273,'59','Maulana Ashiq Khan','Aasik Khan','247'::jsonb,'Common','6th'),
    (274,'59','Maulana Ashiq Khan','Aasik Khan','249'::jsonb,'Common','6th'),
    (275,'110','Sarfaraz','Sarfaraz','132'::jsonb,'T50',NULL),
    (276,'110','Sarfaraz','Sarfaraz','235'::jsonb,'T100',NULL),
    (277,'105','Sahil','Sahil','122'::jsonb,'T50',NULL),
    (278,'11','Arshad','Arshad','229'::jsonb,'T100',NULL),
    (279,'85','Mujahid','Mujahid','187'::jsonb,'Common','6th'),
    (280,'85','Mujahid','Mujahid','188'::jsonb,'Common','6th'),
    (281,'84','Mufti Tanveer Markazi','Mufti Tanveer Markazi','230'::jsonb,'Common','6th'),
    (282,'105','Sahil','Sahil','190'::jsonb,'Common','6th'),
    (283,'105','Sahil','Sahil','190'::jsonb,'Common','6th'),
    (284,'45','Imran','Imran','218'::jsonb,'Common','6th'),
    (285,'88','Mujeem','Mujeem','207'::jsonb,'Common','6th'),
    (286,'43','Iftekhar','Iftekhar','227'::jsonb,'T100',NULL),
    (287,'43','Iftekhar','Iftekhar','129'::jsonb,'T50',NULL),
    (288,'43','Iftekhar','Iftekhar','130'::jsonb,'T50',NULL),
    (289,'43','Iftekhar','Iftekhar','131'::jsonb,'T50',NULL),
    (290,'43','Iftekhar','Iftekhar','124'::jsonb,'T50',NULL),
    (291,'41','Hasnain','Hasnain','226'::jsonb,'Common','6th'),
    (292,'43','Iftekhar','Iftekhar','223'::jsonb,NULL,NULL),
    (293,'81','Mohammad Yasin','Mohammad Yasin','192'::jsonb,NULL,NULL),
    (294,'81','Mohammad Yasin','Mohammad Yasin','136'::jsonb,'T50',NULL),
    (295,'54','M Saiyed Manzar Husain','M Saiyed Manzar Husain','267'::jsonb,'Common','6th'),
    (296,'100','Rehan','Rehan','196'::jsonb,'Common','6th'),
    (297,'110','Sarfaraz','Sarfaraz','206'::jsonb,'Common','6th'),
    (298,'122','Soroor Ali','Soroor Ali','194'::jsonb,'Common','6th'),
    (299,'122','Soroor Ali','Soroor Ali','193'::jsonb,'Common','6th'),
    (300,'3','Abu Salik','Abu Salik','213'::jsonb,'Common','6th'),
    (301,'77','Modassir Husain','Modassir Husain','191'::jsonb,'Common','6th'),
    (302,'51','M Ashiq Khan','Aasik Khan','259'::jsonb,'Common','6th'),
    (303,'51','M Ashiq Khan','Aasik Khan','258'::jsonb,'Common','6th'),
    (304,'22','Dilbar','Dilbar Raza','67'::jsonb,'Common','6th'),
    (305,'41','Hasnain','Hasnain','225'::jsonb,'Common','6th'),
    (306,'17','Asrar Ahmad','Asrar Ahmad','222'::jsonb,'Common','6th'),
    (307,'19','Bani Kund Imam','Bani Kund Imam','246'::jsonb,'Common','6th'),
    (308,'19','Bani Kund Imam','Bani Kund Imam','263'::jsonb,'Common','6th'),
    (309,'99','Ramzani','Ramzani','209'::jsonb,'Common','6th'),
    (310,'51','M Ashiq Khan','Aasik Khan','79'::jsonb,'Common','6th'),
    (311,'25','Faisal','Faisal','204'::jsonb,'Common','6th'),
    (312,'106','Saiyed Abdul Aziz','Saiyed Abdul Aziz','244'::jsonb,'Common','6th'),
    (313,'106','Saiyed Abdul Aziz','Saiyed Abdul Aziz','245'::jsonb,'Common','6th'),
    (314,'91','Nizami','Nizami','210'::jsonb,'Common','6th'),
    (315,'51','M Ashiq Khan','Aasik Khan','219'::jsonb,'Common','6th'),
    (316,'121','Sona Bhai','Sona Bhai','177'::jsonb,'Common','6th'),
    (317,'51','M Ashiq Khan','Aasik Khan','215'::jsonb,'Common','6th'),
    (318,'5','Ahmad Raza','Ahmad Raza','173'::jsonb,'Common','6th'),
    (319,'51','M Ashiq Khan','Aasik Khan','163'::jsonb,'Common','6th'),
    (320,'32','Hafiz Azhar','Hafiz Azhar','170'::jsonb,'Common','6th'),
    (321,'79','Mohammad Imteyaz','Mohammad Imteyaz','176'::jsonb,'Common','6th'),
    (322,'1','Abdul Hafiz','Abdul Hafiz','175'::jsonb,'Common','6th')
  ;
  -- This alias was explicitly confirmed during the Edition 5 repair. The new
  -- workbook still uses Maulana Dilbar on rows 199 and 200; both are Dilbar Raza.
  -- Keep the original names/provenance; change only the intended identity.
  UPDATE dms_identity_source_profiles SET corrected_name='Dilbar Raza'
    WHERE source_id=65 AND original_name='Maulana Dilbar';
  UPDATE dms_identity_source_rows SET corrected_name='Dilbar Raza'
    WHERE source_id=65 AND corrected_name='Maulana Dilbar';
  IF (SELECT count(*) FROM dms_identity_source_profiles)<>138
    OR (SELECT count(DISTINCT corrected_name) FROM dms_identity_source_profiles)<>110
    OR (SELECT count(*) FROM dms_identity_source_rows)<>321 THEN
    RAISE EXCEPTION 'Unexpected corrected workbook mapping; no changes made';
  END IF;

  -- Resolve UUIDs by the original import keys, never by similarity or current names.
  SELECT string_agg(s.source_id::text,', ' ORDER BY s.source_id) INTO problem
  FROM dms_identity_source_profiles s
  LEFT JOIN public.fundraisers f ON f.legacy_import_key='Fundraisers_Data_v1:'||s.source_id::text
  LEFT JOIN public.people p ON p.id=f.person_id
  WHERE p.id IS NULL OR p.role<>'COLLECTOR' OR p.auth_user_id IS NOT NULL;
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'Original fundraiser import IDs are missing or are not fundraiser-only profiles: %. No changes made.',problem;
  END IF;
  SELECT string_agg(s.source_row::text,', ' ORDER BY s.source_row) INTO problem
  FROM dms_identity_source_rows s LEFT JOIN public.legacy_collection_imports l
    ON l.source_key='Book3_v1:Sheet1:'||s.source_row::text
  WHERE l.source_key IS NULL OR l.source_row<>s.source_row
    OR btrim(coalesce(l.source_data->>'Fundraiser Name',''))<>s.original_name
    OR (l.source_data->'Book No.') IS DISTINCT FROM s.original_book
    OR nullif(btrim(l.source_data->>'Type'),'') IS DISTINCT FROM s.original_type
    OR nullif(btrim(l.source_data->>'Edition'),'') IS DISTINCT FROM s.original_edition
    OR l.source_hash IS DISTINCT FROM encode(sha256(convert_to(l.source_data::text,'UTF8')),'hex');
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'Original Book3 import provenance differs at Excel rows %. No changes made.',problem;
  END IF;

  CREATE TEMP TABLE dms_identity_members ON COMMIT DROP AS
    SELECT s.*,p.id AS person_id,f.id AS fundraiser_id,f.code,
      to_jsonb(p) AS original_person,to_jsonb(f) AS original_profile
    FROM dms_identity_source_profiles s
    JOIN public.fundraisers f ON f.legacy_import_key='Fundraisers_Data_v1:'||s.source_id::text
    JOIN public.people p ON p.id=f.person_id;
  CREATE UNIQUE INDEX ON dms_identity_members(person_id);
  CREATE TEMP TABLE dms_identity_canonical ON COMMIT DROP AS
    SELECT DISTINCT ON (m.corrected_name) m.corrected_name,m.person_id,m.fundraiser_id,m.code
    FROM dms_identity_members m JOIN public.people p ON p.id=m.person_id
      JOIN public.fundraisers f ON f.id=m.fundraiser_id
    WHERE p.deleted_at IS NULL AND f.deleted_at IS NULL
    ORDER BY m.corrected_name,
      CASE WHEN m.code ~ '^JAH[0-9]+$' THEN substring(m.code FROM 4)::bigint END NULLS LAST,
      p.created_at,p.id;
  IF (SELECT count(*) FROM dms_identity_canonical)<>110 THEN
    RAISE EXCEPTION 'A corrected identity has no live source profile. No deleted account will be restored automatically.';
  END IF;
  CREATE UNIQUE INDEX ON dms_identity_canonical(person_id);
  CREATE UNIQUE INDEX ON dms_identity_canonical(corrected_name);
  CREATE TEMP TABLE dms_identity_map ON COMMIT DROP AS
    SELECT m.*,c.person_id AS canonical_id,c.fundraiser_id AS canonical_fundraiser_id,c.code AS retained_code
    FROM dms_identity_members m JOIN dms_identity_canonical c USING(corrected_name);
  SELECT count(*) INTO alias_count FROM dms_identity_map WHERE person_id<>canonical_id;
  IF alias_count<>28 THEN RAISE EXCEPTION 'Expected 28 duplicate profiles, found %. No changes made.',alias_count; END IF;

  CREATE TEMP TABLE dms_identity_row_targets ON COMMIT DROP AS
    SELECT s.source_row,c.person_id AS canonical_id,c.corrected_name,l.assignment_id,l.return_id,
      l.book_id,l.receipt_id,l.status
    FROM dms_identity_source_rows s JOIN dms_identity_canonical c ON c.corrected_name=s.corrected_name
      JOIN public.legacy_collection_imports l ON l.source_key='Book3_v1:Sheet1:'||s.source_row::text;
  SELECT count(*) INTO named_rows FROM dms_identity_row_targets;
  IF named_rows<>310 THEN RAISE EXCEPTION 'Expected 310 named collection rows'; END IF;
  -- Row 111 is a real ownership correction, not an alias for all of Quari's books.
  SELECT string_agg(conflict.description,'; ' ORDER BY conflict.description) INTO problem
  FROM (
    SELECT a.number||' [Excel rows '||string_agg(t.source_row::text,', ' ORDER BY t.source_row)
      ||'; corrected names: '||string_agg(DISTINCT t.corrected_name,', ' ORDER BY t.corrected_name)||']' AS description
    FROM dms_identity_row_targets t JOIN public.book_assignments a ON a.id=t.assignment_id
    WHERE t.status='IMPORTED' GROUP BY a.id,a.number HAVING count(DISTINCT t.canonical_id)>1
  ) conflict;
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE='An existing assignment contains rows corrected to different people; no changes made.',
      DETAIL=problem,
      HINT='Run manual-diagnose-fundraiser-identity-conflicts.sql and share its result before changing assignment ownership.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM dms_identity_row_targets t
    LEFT JOIN public.book_assignments a ON a.id=t.assignment_id
    LEFT JOIN public.book_returns r ON r.id=t.return_id
    LEFT JOIN public.book_cases k ON k.id=r.case_id
    LEFT JOIN public.book_receipts receipt ON receipt.id=t.receipt_id
    WHERE t.status='IMPORTED' AND (a.id IS NULL OR r.id IS NULL OR k.id IS NULL
      OR r.assignment_id<>a.id OR r.book_id<>t.book_id OR k.assignment_id<>a.id OR k.book_id<>t.book_id
      OR NOT EXISTS (SELECT 1 FROM dms_identity_members m WHERE m.person_id=a.collector_id)
      OR (t.receipt_id IS NOT NULL AND (receipt.id IS NULL OR receipt.return_id<>r.id OR receipt.book_id<>r.book_id)))
  ) THEN RAISE EXCEPTION 'Historical assignment/receipt links differ from their import ledger. No changes made.'; END IF;

  CREATE TEMP TABLE dms_identity_assignment_targets ON COMMIT DROP AS
    SELECT a.id,coalesce(t.canonical_id,m.canonical_id) AS canonical_id
    FROM public.book_assignments a LEFT JOIN dms_identity_map m ON m.person_id=a.collector_id
    LEFT JOIN (SELECT assignment_id,min(canonical_id::text)::uuid AS canonical_id
      FROM dms_identity_row_targets WHERE status='IMPORTED' GROUP BY assignment_id) t ON t.assignment_id=a.id
    WHERE m.person_id IS NOT NULL OR t.assignment_id IS NOT NULL;
  CREATE UNIQUE INDEX ON dms_identity_assignment_targets(id);
  IF EXISTS (
    SELECT 1 FROM dms_identity_assignment_targets t
    JOIN public.book_assignments a ON a.id=t.id
    JOIN dms_identity_map m ON m.person_id=a.collector_id
    WHERE t.canonical_id<>m.canonical_id AND EXISTS (
      SELECT 1 FROM public.book_cases k WHERE k.assignment_id=a.id AND NOT EXISTS (
        SELECT 1 FROM dms_identity_row_targets r WHERE r.status='IMPORTED'
          AND r.assignment_id=a.id AND r.book_id=k.book_id AND r.canonical_id=t.canonical_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'A row-specific owner correction would move additional books on the same issued assignment. Review those books first; no changes made.';
  END IF;

  -- Snapshots also protect exact historical commissions and all issued document numbers.
  CREATE TEMP TABLE dms_identity_return_before ON COMMIT DROP AS
    SELECT r.id,to_jsonb(r)-ARRAY['collector_name','updated_at'] AS preserved FROM public.book_returns r;
  CREATE TEMP TABLE dms_identity_assignment_before ON COMMIT DROP AS
    SELECT a.id,to_jsonb(a)-ARRAY['collector_id','collector_name','collector_code','updated_at'] AS preserved
    FROM public.book_assignments a;
  CREATE TEMP TABLE dms_identity_receipt_before ON COMMIT DROP AS
    SELECT r.id,to_jsonb(r) AS preserved FROM public.book_receipts r;
  CREATE TEMP TABLE dms_identity_book_before ON COMMIT DROP AS
    SELECT b.id,to_jsonb(b) AS preserved FROM public.books b;
  CREATE TEMP TABLE dms_identity_case_before ON COMMIT DROP AS
    SELECT k.id,to_jsonb(k) AS preserved FROM public.book_cases k;
  CREATE TEMP TABLE dms_identity_leftover_before ON COMMIT DROP AS
    SELECT l.id,to_jsonb(l)-ARRAY['returned_by','updated_at'] AS preserved FROM public.leftover_books l;
  CREATE TEMP TABLE dms_identity_flag_before ON COMMIT DROP AS
    SELECT f.id,to_jsonb(f)-ARRAY['collector_id','updated_at'] AS preserved FROM public.book_flags f;
  CREATE TEMP TABLE dms_identity_loss_before ON COMMIT DROP AS
    SELECT l.id,to_jsonb(l)-ARRAY['collector_id','updated_at'] AS preserved FROM public.book_losses l;
  CREATE TEMP TABLE dms_identity_certificate_before ON COMMIT DROP AS
    SELECT assignment_id,to_jsonb(c) AS preserved FROM public.assignment_authorization_certificates c;
  CREATE TEMP TABLE dms_identity_ledger_before ON COMMIT DROP AS
    SELECT source_key,to_jsonb(l)-ARRAY['person_id','source_corrections'] AS preserved
    FROM public.legacy_collection_imports l;

  CREATE TABLE IF NOT EXISTS public.fundraiser_identity_aliases (
    source_person_id uuid PRIMARY KEY REFERENCES public.people(id) ON DELETE RESTRICT,
    canonical_person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
    source_import_key text NOT NULL UNIQUE,original_code text NOT NULL,original_name text NOT NULL,
    corrected_name text NOT NULL,source_file text NOT NULL,source_sha256 text NOT NULL,
    merged_at timestamptz NOT NULL DEFAULT now(),
    CHECK (source_person_id<>canonical_person_id),CHECK (source_sha256 ~ '^[0-9a-f]{64}$')
  );
  ALTER TABLE public.fundraiser_identity_aliases ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.fundraiser_identity_aliases FORCE ROW LEVEL SECURITY;
  REVOKE ALL ON public.fundraiser_identity_aliases FROM PUBLIC,dms_runtime;
  DROP POLICY IF EXISTS owner_maintenance ON public.fundraiser_identity_aliases;
  EXECUTE format('CREATE POLICY owner_maintenance ON public.fundraiser_identity_aliases TO %I USING (true) WITH CHECK (true)',current_user);
  INSERT INTO public.fundraiser_identity_aliases(source_person_id,canonical_person_id,source_import_key,
    original_code,original_name,corrected_name,source_file,source_sha256)
  SELECT person_id,canonical_id,'Fundraisers_Data_v1:'||source_id::text,code,original_person->>'full_name',
    corrected_name,'Money Receipt Data Entry-fundraisers correction.xlsm',batch_hash
  FROM dms_identity_map WHERE person_id<>canonical_id;

  PERFORM set_config('app.change_reason','Correct fundraiser identities from approved workbook; preserve issued JAH/document numbers',true);
  -- Preserve the retained profile's details. Fill missing contact/photo/commission
  -- only when the merged profiles provide one unambiguous value.
  CREATE TEMP TABLE dms_identity_details ON COMMIT DROP AS
    SELECT m.canonical_id,
      CASE WHEN count(DISTINCT nullif(p.phone,''))=1 THEN min(nullif(p.phone,'')) END AS phone,
      CASE WHEN count(DISTINCT p.profile_photo_key)=1 THEN min(p.profile_photo_key) END AS photo,
      CASE WHEN count(DISTINCT nullif(f.whatsapp,''))=1 THEN min(nullif(f.whatsapp,'')) END AS whatsapp,
      CASE WHEN count(DISTINCT nullif(f.father_name,''))=1 THEN min(nullif(f.father_name,'')) END AS father_name,
      CASE WHEN count(DISTINCT f.commission_basis_points)=1 THEN min(f.commission_basis_points) END AS commission,
      bool_or(f.leftover_eligible) AS leftover_eligible,
      CASE WHEN bool_or(p.status='BLOCKED') THEN 'BLOCKED'
        WHEN bool_or(p.status='INACTIVE') THEN 'INACTIVE' ELSE 'ACTIVE' END AS status
    FROM dms_identity_map m JOIN public.people p ON p.id=m.person_id
      JOIN public.fundraisers f ON f.id=m.fundraiser_id GROUP BY m.canonical_id;
  -- Release a moved phone before assigning it to the retained row (phone is unique).
  UPDATE public.people p SET phone=NULL,updated_at=now()
  FROM dms_identity_map m,dms_identity_details d,public.people retained
  WHERE p.id=m.person_id AND m.person_id<>m.canonical_id AND d.canonical_id=m.canonical_id
    AND retained.id=m.canonical_id AND retained.phone IS NULL AND p.phone=d.phone;
  UPDATE public.people p SET full_name=c.corrected_name,phone=coalesce(p.phone,d.phone),
    profile_photo_key=coalesce(p.profile_photo_key,d.photo),status=d.status,updated_at=now()
  FROM dms_identity_canonical c,dms_identity_details d WHERE p.id=c.person_id AND d.canonical_id=p.id;
  UPDATE public.fundraisers f SET father_name=coalesce(nullif(f.father_name,''),d.father_name,''),
    whatsapp=coalesce(nullif(f.whatsapp,''),d.whatsapp,''),
    commission_basis_points=coalesce(f.commission_basis_points,d.commission),
    leftover_eligible=d.leftover_eligible,updated_at=now()
  FROM dms_identity_canonical c,dms_identity_details d WHERE f.id=c.fundraiser_id AND d.canonical_id=c.person_id;

  UPDATE public.book_assignments a SET collector_id=t.canonical_id,collector_name=c.corrected_name,
    collector_code=c.code,updated_at=now()
  FROM dms_identity_assignment_targets t,dms_identity_canonical c
  WHERE a.id=t.id AND c.person_id=t.canonical_id
    AND (a.collector_id,a.collector_name,a.collector_code) IS DISTINCT FROM (c.person_id,c.corrected_name,c.code);
  GET DIAGNOSTICS assignment_updates=ROW_COUNT;

  -- Renaming a submission must not recalculate any money values.
  CREATE TEMP TABLE dms_identity_amount_triggers ON COMMIT DROP AS
    SELECT tgname,tgenabled FROM pg_catalog.pg_trigger WHERE tgrelid='public.book_returns'::regclass
      AND tgfoid=to_regprocedure('public.calculate_book_return_amounts()') AND tgenabled<>'D';
  FOR item IN SELECT * FROM dms_identity_amount_triggers LOOP
    EXECUTE format('ALTER TABLE public.book_returns DISABLE TRIGGER %I',item.tgname);
  END LOOP;
  UPDATE public.book_returns r SET collector_name=a.collector_name,updated_at=now()
  FROM public.book_assignments a,dms_identity_assignment_targets t
  WHERE r.assignment_id=a.id AND a.id=t.id AND r.collector_name IS DISTINCT FROM a.collector_name;
  FOR item IN SELECT * FROM dms_identity_amount_triggers LOOP
    EXECUTE format('ALTER TABLE public.book_returns ENABLE %sTRIGGER %I',
      CASE item.tgenabled WHEN 'A' THEN 'ALWAYS ' WHEN 'R' THEN 'REPLICA ' ELSE '' END,item.tgname);
  END LOOP;
  UPDATE public.book_flags f SET collector_id=a.collector_id,updated_at=now()
  FROM public.book_returns r,public.book_assignments a,dms_identity_assignment_targets t
  WHERE f.return_id=r.id AND r.assignment_id=a.id AND a.id=t.id AND f.collector_id IS DISTINCT FROM a.collector_id;
  UPDATE public.book_losses l SET collector_id=a.collector_id,updated_at=now()
  FROM public.book_assignments a,dms_identity_assignment_targets t
  WHERE l.assignment_id=a.id AND a.id=t.id AND l.collector_id IS DISTINCT FROM a.collector_id;
  UPDATE public.leftover_books l SET returned_by=a.collector_id,updated_at=now()
  FROM public.book_returns r,public.book_assignments a,dms_identity_assignment_targets t
  WHERE l.return_id=r.id AND r.assignment_id=a.id AND a.id=t.id AND l.returned_by IS DISTINCT FROM a.collector_id;
  -- Requests keep their historical proposed values; supersede pending proposals
  -- so an old alias spelling cannot overwrite the approved corrected identity.
  UPDATE public.collector_edit_requests q SET collector_id=m.canonical_id,
    deleted_at=CASE WHEN q.status='PENDING' THEN coalesce(q.deleted_at,now()) ELSE q.deleted_at END,updated_at=now()
  FROM dms_identity_map m WHERE q.collector_id=m.person_id
    AND (m.person_id<>m.canonical_id OR (q.status='PENDING' AND q.deleted_at IS NULL
      AND (q.new_values->>'fullName') IS DISTINCT FROM m.corrected_name));

  ALTER TABLE public.legacy_collection_imports
    ADD COLUMN IF NOT EXISTS source_corrections jsonb NOT NULL DEFAULT '{}'::jsonb;
  UPDATE public.legacy_collection_imports l SET
    person_id=CASE WHEN l.person_id IS NULL THEN NULL ELSE t.canonical_id END,
    source_corrections=coalesce(l.source_corrections,'{}'::jsonb)||jsonb_build_object('Fundraiser Name',t.corrected_name)
  FROM dms_identity_row_targets t WHERE l.source_key='Book3_v1:Sheet1:'||t.source_row::text;
  -- Other import provenance can reference these profiles as well.
  UPDATE public.legacy_collection_imports l SET person_id=m.canonical_id
  FROM dms_identity_map m WHERE l.person_id=m.person_id AND m.person_id<>m.canonical_id;

  UPDATE public.fundraisers f SET deleted_at=coalesce(f.deleted_at,now()),updated_at=now()
  FROM dms_identity_map m WHERE f.id=m.fundraiser_id AND m.person_id<>m.canonical_id;
  UPDATE public.people p SET deleted_at=coalesce(p.deleted_at,now()),updated_at=now()
  FROM dms_identity_map m WHERE p.id=m.person_id AND m.person_id<>m.canonical_id;

  IF EXISTS (SELECT 1 FROM public.book_assignments a JOIN dms_identity_map m ON m.person_id=a.collector_id
    WHERE m.person_id<>m.canonical_id)
    OR EXISTS (SELECT 1 FROM public.book_flags f JOIN dms_identity_map m ON m.person_id=f.collector_id WHERE m.person_id<>m.canonical_id)
    OR EXISTS (SELECT 1 FROM public.book_losses l JOIN dms_identity_map m ON m.person_id=l.collector_id WHERE m.person_id<>m.canonical_id)
    OR EXISTS (SELECT 1 FROM public.leftover_books l JOIN dms_identity_map m ON m.person_id=l.returned_by WHERE m.person_id<>m.canonical_id)
    OR EXISTS (SELECT 1 FROM public.collector_edit_requests q JOIN dms_identity_map m ON m.person_id=q.collector_id WHERE m.person_id<>m.canonical_id)
    OR EXISTS (SELECT 1 FROM public.legacy_collection_imports l JOIN dms_identity_map m ON m.person_id=l.person_id WHERE m.person_id<>m.canonical_id) THEN
    RAISE EXCEPTION 'A domain link still references a duplicate profile. The entire correction is rolled back.';
  END IF;
  IF EXISTS (SELECT 1 FROM dms_identity_assignment_targets t JOIN public.book_assignments a ON a.id=t.id
    WHERE a.collector_id<>t.canonical_id)
    OR EXISTS (SELECT 1 FROM dms_identity_row_targets t JOIN public.legacy_collection_imports l
      ON l.source_key='Book3_v1:Sheet1:'||t.source_row::text WHERE l.person_id IS NOT NULL AND l.person_id<>t.canonical_id) THEN
    RAISE EXCEPTION 'A corrected collection owner differs from the workbook. The entire correction is rolled back.';
  END IF;
  IF (SELECT count(*) FROM public.people p JOIN public.fundraisers f ON f.person_id=p.id
    JOIN dms_identity_canonical c ON c.person_id=p.id WHERE p.deleted_at IS NULL AND f.deleted_at IS NULL
      AND p.full_name=c.corrected_name AND f.code=c.code)<>110 THEN
    RAISE EXCEPTION 'Expected exactly 110 visible corrected imported profiles. The entire correction is rolled back.';
  END IF;

  IF EXISTS (SELECT 1 FROM dms_identity_return_before s FULL JOIN public.book_returns r ON r.id=s.id
    WHERE s.preserved IS DISTINCT FROM to_jsonb(r)-ARRAY['collector_name','updated_at'])
    OR EXISTS (SELECT 1 FROM dms_identity_assignment_before s FULL JOIN public.book_assignments a ON a.id=s.id
    WHERE s.preserved IS DISTINCT FROM to_jsonb(a)-ARRAY['collector_id','collector_name','collector_code','updated_at'])
    OR EXISTS (SELECT 1 FROM dms_identity_receipt_before s FULL JOIN public.book_receipts r ON r.id=s.id WHERE s.preserved IS DISTINCT FROM to_jsonb(r))
    OR EXISTS (SELECT 1 FROM dms_identity_book_before s FULL JOIN public.books b ON b.id=s.id WHERE s.preserved IS DISTINCT FROM to_jsonb(b))
    OR EXISTS (SELECT 1 FROM dms_identity_case_before s FULL JOIN public.book_cases k ON k.id=s.id WHERE s.preserved IS DISTINCT FROM to_jsonb(k))
    OR EXISTS (SELECT 1 FROM dms_identity_leftover_before s FULL JOIN public.leftover_books l ON l.id=s.id
    WHERE s.preserved IS DISTINCT FROM to_jsonb(l)-ARRAY['returned_by','updated_at'])
    OR EXISTS (SELECT 1 FROM dms_identity_flag_before s FULL JOIN public.book_flags f ON f.id=s.id
    WHERE s.preserved IS DISTINCT FROM to_jsonb(f)-ARRAY['collector_id','updated_at'])
    OR EXISTS (SELECT 1 FROM dms_identity_loss_before s FULL JOIN public.book_losses l ON l.id=s.id
    WHERE s.preserved IS DISTINCT FROM to_jsonb(l)-ARRAY['collector_id','updated_at'])
    OR EXISTS (SELECT 1 FROM dms_identity_certificate_before s FULL JOIN public.assignment_authorization_certificates c ON c.assignment_id=s.assignment_id
    WHERE s.preserved IS DISTINCT FROM to_jsonb(c))
    OR EXISTS (SELECT 1 FROM dms_identity_ledger_before s FULL JOIN public.legacy_collection_imports l ON l.source_key=s.source_key
    WHERE s.preserved IS DISTINCT FROM to_jsonb(l)-ARRAY['person_id','source_corrections']) THEN
    RAISE EXCEPTION 'Unrelated receipt, money, book, document or provenance data changed. The entire correction is rolled back.';
  END IF;

  result:=jsonb_build_object('sourceRows',321,
    'correctedNameRows',(SELECT count(*) FROM dms_identity_source_rows WHERE original_name<>corrected_name),
    'visibleImportedFundraisers',(SELECT count(*) FROM dms_identity_canonical),
    'confirmedAlias',jsonb_build_object('originalName','Maulana Dilbar','correctedName','Dilbar Raza'),
    'duplicateProfilesMerged',alias_count,'assignmentLabelsOrOwnersUpdated',assignment_updates,
    'blankNameRowsNotGuessed',321-named_rows,'receiptRowsPreserved',(SELECT count(*) FROM dms_identity_receipt_before),
    'receiptAndCommissionAmountsPreserved',true,'issuedDocumentNumbersPreserved',true,
    'row111', (SELECT jsonb_build_object('fundraiser',corrected_name,'status',status) FROM dms_identity_row_targets WHERE source_row=111),
    'mergedGroups',(SELECT jsonb_agg(jsonb_build_object('name',g.corrected_name,'retainedCode',g.retained_code,'retiredCodes',g.retired_codes) ORDER BY g.corrected_name)
      FROM (SELECT corrected_name,retained_code,array_agg(code ORDER BY code) AS retired_codes
        FROM dms_identity_map WHERE person_id<>canonical_id GROUP BY corrected_name,retained_code) g));
  INSERT INTO public.activity_log(action,resource,record_id,new_values,reason)
    VALUES('FUNDRAISER_IDENTITIES_CORRECTED','fundraisers',batch_hash,result,
      'Database-owner correction from COLLECTION names; retain one JAH code and all issued document numbers; archive duplicate profiles');
END;
$correct_fundraiser_identities$;

SELECT new_values AS correction_result FROM public.activity_log
WHERE action='FUNDRAISER_IDENTITIES_CORRECTED' AND resource='fundraisers'
  AND record_id='45e535956bf0dde4b62ebd1ba0bd961346e224cc13f11285acff6b28b57b6f9b'
ORDER BY created_at DESC,id DESC LIMIT 1;
